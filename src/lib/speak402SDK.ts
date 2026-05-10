/**
 * speak402SDK.ts
 * On-chain Anchor client for the speak402_policy program.
 * Deployed at: CQMQ2Z26ueLm7hNa2rFGADtdLhURSN9MfcUTDqCjkni4
 */
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import idlJson from '@/idl/speak402IDL.json';
import { PROGRAM_ID, DEVNET_USDC_MINT } from './constants';
import type { PolicyState } from './types';

// ---------------------------------------------------------------------------
// PDA derivation helpers
// ---------------------------------------------------------------------------

export function derivePolicyPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('policy'), owner.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveEscrowPDA(policyPDA: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), policyPDA.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveReceiptPDA(
  policyPDA: PublicKey,
  receiptId: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('receipt'),
      policyPDA.toBuffer(),
      receiptId.toArrayLike(Buffer, 'le', 8),
    ],
    PROGRAM_ID
  );
}

// ---------------------------------------------------------------------------
// Program instance factory
// ---------------------------------------------------------------------------

export function getProgram(
  connection: Connection,
  wallet: AnchorWallet
): Program {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  return new Program(idlJson as unknown as Idl, provider);
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

export async function fetchPolicyAccount(
  connection: Connection,
  wallet: AnchorWallet
): Promise<PolicyState | null> {
  try {
    const program = getProgram(connection, wallet);
    const [policyPDA] = derivePolicyPDA(wallet.publicKey);
    const [escrowPDA] = deriveEscrowPDA(policyPDA);

    const account = await (program.account as any).policyAccount.fetch(
      policyPDA
    );
    if (!account) return null;

    return {
      address: policyPDA.toBase58(),
      owner: account.owner.toBase58(),
      escrowVault: account.escrowVault?.toBase58?.() || escrowPDA.toBase58(),
      mockUsdcMint: account.mockUsdcMint?.toBase58?.() || DEVNET_USDC_MINT.toBase58(),
      perRequestCap: account.perRequestCap.toNumber(),
      dailyCap: account.dailyCap.toNumber(),
      spentToday: account.spentToday.toNumber(),
      resetTimestamp: account.resetTimestamp.toNumber(),
      allowedMerchantHash: Array.from(account.allowedMerchantHash),
      expiresAt: account.expiresAt.toNumber(),
      bump: account.bump,
      revoked: account.revoked,
    };
  } catch {
    return null;
  }
}

export async function fetchEscrowBalance(
  connection: Connection,
  policyPDA: PublicKey
): Promise<number> {
  try {
    const [escrowPDA] = deriveEscrowPDA(policyPDA);
    const tokenAccount = await getAccount(connection, escrowPDA);
    return Number(tokenAccount.amount);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Instruction: initialize_config (initialize_policy)
// ---------------------------------------------------------------------------

export async function initializePolicy(
  connection: Connection,
  wallet: AnchorWallet,
  params: {
    perRequestCap: BN;
    dailyCap: BN;
    allowedMerchantHash: number[];
    expiresAt: BN;
  }
): Promise<string> {
  const program = getProgram(connection, wallet);
  const [policyPDA] = derivePolicyPDA(wallet.publicKey);
  const [escrowPDA] = deriveEscrowPDA(policyPDA);

  const tx = await program.methods
    .initializeConfig(
      params.perRequestCap,
      params.dailyCap,
      params.allowedMerchantHash,
      params.expiresAt
    )
    .accounts({
      owner: wallet.publicKey,
      policyAccount: policyPDA,
      escrowVault: escrowPDA,
      mockUsdcMint: DEVNET_USDC_MINT,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc({ commitment: 'confirmed' });

  return tx;
}

// ---------------------------------------------------------------------------
// Instruction: deposit
// ---------------------------------------------------------------------------

export async function deposit(
  connection: Connection,
  wallet: AnchorWallet,
  amount: BN
): Promise<string> {
  const program = getProgram(connection, wallet);
  const [policyPDA] = derivePolicyPDA(wallet.publicKey);
  const [escrowPDA] = deriveEscrowPDA(policyPDA);

  const userTokenAccount = await getAssociatedTokenAddress(
    DEVNET_USDC_MINT,
    wallet.publicKey
  );

  const tx = await program.methods
    .deposit(amount)
    .accounts({
      owner: wallet.publicKey,
      policyAccount: policyPDA,
      userTokenAccount,
      escrowVault: escrowPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc({ commitment: 'confirmed' });

  return tx;
}

// ---------------------------------------------------------------------------
// Instruction: authorize_payment
// ---------------------------------------------------------------------------

export async function authorizePayment(
  connection: Connection,
  wallet: AnchorWallet,
  params: {
    merchantHash: number[];
    resourceHash: number[];
    amount: BN;
    merchantTokenAccount: PublicKey;
  }
): Promise<{ txSignature: string; receiptAddress: string; receiptId: number }> {
  const program = getProgram(connection, wallet);
  const [policyPDA] = derivePolicyPDA(wallet.publicKey);
  const [escrowPDA] = deriveEscrowPDA(policyPDA);

  const receiptId = new BN(Date.now());
  const [receiptPDA] = deriveReceiptPDA(policyPDA, receiptId);

  const tx = await program.methods
    .authorizePayment(
      params.merchantHash,
      params.resourceHash,
      params.amount,
      receiptId
    )
    .accounts({
      owner: wallet.publicKey,
      policyAccount: policyPDA,
      escrowVault: escrowPDA,
      merchantTokenAccount: params.merchantTokenAccount,
      receiptAccount: receiptPDA,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc({ commitment: 'confirmed' });

  return {
    txSignature: tx,
    receiptAddress: receiptPDA.toBase58(),
    receiptId: receiptId.toNumber(),
  };
}

// ---------------------------------------------------------------------------
// Instruction: mark_fulfilled
// ---------------------------------------------------------------------------

export async function markFulfilled(
  connection: Connection,
  wallet: AnchorWallet,
  receiptId: BN
): Promise<string> {
  const program = getProgram(connection, wallet);
  const [policyPDA] = derivePolicyPDA(wallet.publicKey);
  const [receiptPDA] = deriveReceiptPDA(policyPDA, receiptId);

  const tx = await program.methods
    .markFulfilled(receiptId)
    .accounts({
      owner: wallet.publicKey,
      policyAccount: policyPDA,
      receiptAccount: receiptPDA,
    })
    .rpc({ commitment: 'confirmed' });

  return tx;
}

// ---------------------------------------------------------------------------
// Instruction: revoke_policy
// ---------------------------------------------------------------------------

export async function revokePolicy(
  connection: Connection,
  wallet: AnchorWallet
): Promise<string> {
  const program = getProgram(connection, wallet);
  const [policyPDA] = derivePolicyPDA(wallet.publicKey);
  const [escrowPDA] = deriveEscrowPDA(policyPDA);

  const ownerTokenAccount = await getAssociatedTokenAddress(
    DEVNET_USDC_MINT,
    wallet.publicKey
  );

  const tx = await program.methods
    .revokePolicy()
    .accounts({
      owner: wallet.publicKey,
      policyAccount: policyPDA,
      escrowVault: escrowPDA,
      ownerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc({ commitment: 'confirmed' });

  return tx;
}

// ---------------------------------------------------------------------------
// Helper: Check user USDC balance
// ---------------------------------------------------------------------------

export async function getUserUsdcBalance(
  connection: Connection,
  owner: PublicKey
): Promise<number> {
  try {
    const ata = await getAssociatedTokenAddress(DEVNET_USDC_MINT, owner);
    const account = await getAccount(connection, ata);
    return Number(account.amount);
  } catch {
    return 0;
  }
}
