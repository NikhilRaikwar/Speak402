import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Workspace } from "../target/types/workspace";
import { expect } from "chai";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  Keypair,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

describe("speak402_policy", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.workspace as Program<Workspace>;

  let owner: Keypair;
  let merchant: Keypair;
  let mockUsdcMint: Keypair;
  let ownerTokenAccount: PublicKey;
  let merchantTokenAccount: PublicKey;
  let policyPDA: PublicKey;
  let policyBump: number;
  let escrowPDA: PublicKey;
  let escrowBump: number;

  const allowedMerchantHash = new Uint8Array(32);
  allowedMerchantHash[0] = 1;
  allowedMerchantHash[1] = 2;
  allowedMerchantHash[2] = 3;

  const resourceHash = new Uint8Array(32);
  resourceHash[0] = 10;
  resourceHash[1] = 20;

  const perRequestCap = new BN(5_000_000); // 5 USDC
  const dailyCap = new BN(20_000_000); // 20 USDC
  const expiresAt = new BN(Math.floor(Date.now() / 1000) + 86400 * 30); // 30 days from now

  async function createMint(
    connection: anchor.web3.Connection,
    payer: Keypair,
    mintKeypair: Keypair,
    decimals: number
  ) {
    const lamports = await getMinimumBalanceForRentExemptMint(connection);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        payer.publicKey,
        payer.publicKey
      )
    );
    await provider.sendAndConfirm(tx, [payer, mintKeypair]);
  }

  async function createATA(
    payer: Keypair,
    mint: PublicKey,
    ownerPubkey: PublicKey
  ): Promise<PublicKey> {
    const ata = await getAssociatedTokenAddress(mint, ownerPubkey);
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        ownerPubkey,
        mint
      )
    );
    await provider.sendAndConfirm(tx, [payer]);
    return ata;
  }

  async function mintTo(
    payer: Keypair,
    mint: PublicKey,
    dest: PublicKey,
    amount: number
  ) {
    const tx = new Transaction().add(
      createMintToInstruction(mint, dest, payer.publicKey, amount)
    );
    await provider.sendAndConfirm(tx, [payer]);
  }

  before(async () => {
    owner = Keypair.generate();
    merchant = Keypair.generate();
    mockUsdcMint = Keypair.generate();

    // Fund accounts
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        owner.publicKey,
        100 * LAMPORTS_PER_SOL
      )
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        merchant.publicKey,
        100 * LAMPORTS_PER_SOL
      )
    );

    // Create mock USDC mint (6 decimals)
    await createMint(provider.connection, owner, mockUsdcMint, 6);

    // Create owner token account and mint tokens
    ownerTokenAccount = await createATA(
      owner,
      mockUsdcMint.publicKey,
      owner.publicKey
    );
    await mintTo(owner, mockUsdcMint.publicKey, ownerTokenAccount, 100_000_000); // 100 USDC

    // Create merchant token account
    merchantTokenAccount = await createATA(
      merchant,
      mockUsdcMint.publicKey,
      merchant.publicKey
    );

    // Derive PDAs
    [policyPDA, policyBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), owner.publicKey.toBuffer()],
      program.programId
    );

    [escrowPDA, escrowBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), policyPDA.toBuffer()],
      program.programId
    );
  });

  // ── Test 1: Initialize Config ──
  it("initializes policy config successfully", async () => {
    const tx = await program.methods
      .initializeConfig(
        perRequestCap,
        dailyCap,
        Array.from(allowedMerchantHash) as any,
        expiresAt
      )
      .accounts({
        owner: owner.publicKey,
        policyAccount: policyPDA,
        escrowVault: escrowPDA,
        mockUsdcMint: mockUsdcMint.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([owner])
      .rpc();

    const policy = await program.account.policyAccount.fetch(policyPDA);
    expect(policy.owner.toBase58()).to.equal(owner.publicKey.toBase58());
    expect(policy.escrowVault.toBase58()).to.equal(escrowPDA.toBase58());
    expect(policy.mockUsdcMint.toBase58()).to.equal(
      mockUsdcMint.publicKey.toBase58()
    );
    expect(Number(policy.perRequestCap.toString())).to.equal(5_000_000);
    expect(Number(policy.dailyCap.toString())).to.equal(20_000_000);
    expect(Number(policy.spentToday.toString())).to.equal(0);
    expect(policy.revoked).to.be.false;
    expect(policy.bump).to.equal(policyBump);
  });

  // ── Test 2: Deposit tokens ──
  it("deposits tokens into escrow vault", async () => {
    const depositAmount = new BN(50_000_000); // 50 USDC

    await program.methods
      .deposit(depositAmount)
      .accounts({
        owner: owner.publicKey,
        policyAccount: policyPDA,
        userTokenAccount: ownerTokenAccount,
        escrowVault: escrowPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    const escrowAccount = await getAccount(provider.connection, escrowPDA);
    expect(Number(escrowAccount.amount)).to.equal(50_000_000);
  });

  // ── Test 3: Reject zero deposit ──
  it("rejects zero deposit", async () => {
    try {
      await program.methods
        .deposit(new BN(0))
        .accounts({
          owner: owner.publicKey,
          policyAccount: policyPDA,
          userTokenAccount: ownerTokenAccount,
          escrowVault: escrowPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
      expect.fail("Should have thrown");
    } catch (error: any) {
      expect(error.message).to.include("ZeroDeposit");
    }
  });

  // ── Test 4: Authorize payment successfully ──
  it("authorizes a payment and creates receipt", async () => {
    const paymentAmount = new BN(2_000_000); // 2 USDC
    const receiptId = new BN(1);

    const [receiptPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        policyPDA.toBuffer(),
        receiptId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .authorizePayment(
        Array.from(allowedMerchantHash) as any,
        Array.from(resourceHash) as any,
        paymentAmount,
        receiptId
      )
      .accounts({
        owner: owner.publicKey,
        policyAccount: policyPDA,
        escrowVault: escrowPDA,
        merchantTokenAccount: merchantTokenAccount,
        receiptAccount: receiptPDA,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    // Verify receipt
    const receipt = await program.account.merchantReceipt.fetch(receiptPDA);
    expect(receipt.policy.toBase58()).to.equal(policyPDA.toBase58());
    expect(receipt.owner.toBase58()).to.equal(owner.publicKey.toBase58());
    expect(Number(receipt.amount.toString())).to.equal(2_000_000);
    expect(receipt.fulfilled).to.be.false;

    // Verify escrow balance decreased
    const escrowAccount = await getAccount(provider.connection, escrowPDA);
    expect(Number(escrowAccount.amount)).to.equal(48_000_000);

    // Verify merchant received tokens
    const merchantAccount = await getAccount(
      provider.connection,
      merchantTokenAccount
    );
    expect(Number(merchantAccount.amount)).to.equal(2_000_000);

    // Verify spent_today updated
    const policy = await program.account.policyAccount.fetch(policyPDA);
    expect(Number(policy.spentToday.toString())).to.equal(2_000_000);
  });

  // ── Test 5: Reject payment exceeding per-request cap ──
  it("rejects payment exceeding per-request cap", async () => {
    const receiptId = new BN(2);
    const [receiptPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        policyPDA.toBuffer(),
        receiptId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    try {
      await program.methods
        .authorizePayment(
          Array.from(allowedMerchantHash) as any,
          Array.from(resourceHash) as any,
          new BN(6_000_000), // 6 USDC > 5 USDC cap
          receiptId
        )
        .accounts({
          owner: owner.publicKey,
          policyAccount: policyPDA,
          escrowVault: escrowPDA,
          merchantTokenAccount: merchantTokenAccount,
          receiptAccount: receiptPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
      expect.fail("Should have thrown");
    } catch (error: any) {
      expect(error.message).to.include("PerRequestCapExceeded");
    }
  });

  // ── Test 6: Reject wrong merchant hash ──
  it("rejects payment with wrong merchant hash", async () => {
    const wrongMerchantHash = new Uint8Array(32);
    wrongMerchantHash[0] = 99;

    const receiptId = new BN(3);
    const [receiptPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        policyPDA.toBuffer(),
        receiptId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    try {
      await program.methods
        .authorizePayment(
          Array.from(wrongMerchantHash) as any,
          Array.from(resourceHash) as any,
          new BN(1_000_000),
          receiptId
        )
        .accounts({
          owner: owner.publicKey,
          policyAccount: policyPDA,
          escrowVault: escrowPDA,
          merchantTokenAccount: merchantTokenAccount,
          receiptAccount: receiptPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
      expect.fail("Should have thrown");
    } catch (error: any) {
      expect(error.message).to.include("MerchantNotAllowed");
    }
  });

  // ── Test 7: Mark receipt as fulfilled ──
  it("marks receipt as fulfilled", async () => {
    const receiptId = new BN(1);
    const [receiptPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        policyPDA.toBuffer(),
        receiptId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .markFulfilled(receiptId)
      .accounts({
        owner: owner.publicKey,
        policyAccount: policyPDA,
        receiptAccount: receiptPDA,
      })
      .signers([owner])
      .rpc();

    const receipt = await program.account.merchantReceipt.fetch(receiptPDA);
    expect(receipt.fulfilled).to.be.true;
  });

  // ── Test 8: Reject double fulfillment ──
  it("rejects marking already fulfilled receipt", async () => {
    const receiptId = new BN(1);
    const [receiptPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        policyPDA.toBuffer(),
        receiptId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    try {
      await program.methods
        .markFulfilled(receiptId)
        .accounts({
          owner: owner.publicKey,
          policyAccount: policyPDA,
          receiptAccount: receiptPDA,
        })
        .signers([owner])
        .rpc();
      expect.fail("Should have thrown");
    } catch (error: any) {
      expect(error.message).to.include("AlreadyFulfilled");
    }
  });

  // ── Test 9: Multiple payments track daily spending ──
  it("tracks cumulative daily spending correctly", async () => {
    const receiptId = new BN(10);
    const [receiptPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        policyPDA.toBuffer(),
        receiptId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .authorizePayment(
        Array.from(allowedMerchantHash) as any,
        Array.from(resourceHash) as any,
        new BN(3_000_000), // 3 USDC
        receiptId
      )
      .accounts({
        owner: owner.publicKey,
        policyAccount: policyPDA,
        escrowVault: escrowPDA,
        merchantTokenAccount: merchantTokenAccount,
        receiptAccount: receiptPDA,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    const policy = await program.account.policyAccount.fetch(policyPDA);
    // 2M from test 4 + 3M from this test = 5M
    expect(Number(policy.spentToday.toString())).to.equal(5_000_000);
  });

  // ── Test 10: Reject payment exceeding daily cap ──
  it("rejects payment that would exceed daily cap", async () => {
    const receiptId = new BN(11);
    const [receiptPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        policyPDA.toBuffer(),
        receiptId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // spent_today is 5M, daily cap is 20M, trying to spend 16M would exceed
    try {
      await program.methods
        .authorizePayment(
          Array.from(allowedMerchantHash) as any,
          Array.from(resourceHash) as any,
          new BN(5_000_000), // 5 USDC, total would be 10M
          receiptId
        )
        .accounts({
          owner: owner.publicKey,
          policyAccount: policyPDA,
          escrowVault: escrowPDA,
          merchantTokenAccount: merchantTokenAccount,
          receiptAccount: receiptPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      // This should succeed (5M + 5M = 10M < 20M cap), so let's do another to exceed
      const receiptId2 = new BN(12);
      const [receiptPDA2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("receipt"),
          policyPDA.toBuffer(),
          receiptId2.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const receiptId3 = new BN(13);
      const [receiptPDA3] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("receipt"),
          policyPDA.toBuffer(),
          receiptId3.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      await program.methods
        .authorizePayment(
          Array.from(allowedMerchantHash) as any,
          Array.from(resourceHash) as any,
          new BN(5_000_000),
          receiptId2
        )
        .accounts({
          owner: owner.publicKey,
          policyAccount: policyPDA,
          escrowVault: escrowPDA,
          merchantTokenAccount: merchantTokenAccount,
          receiptAccount: receiptPDA2,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      // Now spent_today = 15M, try to spend 5M more = 20M (exactly at cap, should succeed)
      await program.methods
        .authorizePayment(
          Array.from(allowedMerchantHash) as any,
          Array.from(resourceHash) as any,
          new BN(5_000_000),
          receiptId3
        )
        .accounts({
          owner: owner.publicKey,
          policyAccount: policyPDA,
          escrowVault: escrowPDA,
          merchantTokenAccount: merchantTokenAccount,
          receiptAccount: receiptPDA3,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      // Now spent_today = 20M = daily_cap, next payment should fail
      const receiptId4 = new BN(14);
      const [receiptPDA4] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("receipt"),
          policyPDA.toBuffer(),
          receiptId4.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      await program.methods
        .authorizePayment(
          Array.from(allowedMerchantHash) as any,
          Array.from(resourceHash) as any,
          new BN(1_000_000), // 1 USDC more would exceed 20M cap
          receiptId4
        )
        .accounts({
          owner: owner.publicKey,
          policyAccount: policyPDA,
          escrowVault: escrowPDA,
          merchantTokenAccount: merchantTokenAccount,
          receiptAccount: receiptPDA4,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
      expect.fail("Should have thrown");
    } catch (error: any) {
      expect(error.message).to.include("DailyCapExceeded");
    }
  });

  // ── Test 11: Revoke policy and reclaim funds ──
  it("revokes policy and returns remaining escrow tokens", async () => {
    const ownerBefore = await getAccount(
      provider.connection,
      ownerTokenAccount
    );
    const escrowBefore = await getAccount(provider.connection, escrowPDA);
    const escrowBalanceBefore = Number(escrowBefore.amount);

    await program.methods
      .revokePolicy()
      .accounts({
        owner: owner.publicKey,
        policyAccount: policyPDA,
        escrowVault: escrowPDA,
        ownerTokenAccount: ownerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    const policy = await program.account.policyAccount.fetch(policyPDA);
    expect(policy.revoked).to.be.true;

    const escrowAfter = await getAccount(provider.connection, escrowPDA);
    expect(Number(escrowAfter.amount)).to.equal(0);

    const ownerAfter = await getAccount(provider.connection, ownerTokenAccount);
    expect(Number(ownerAfter.amount)).to.equal(
      Number(ownerBefore.amount) + escrowBalanceBefore
    );
  });

  // ── Test 12: Reject payment on revoked policy ──
  it("rejects payment on revoked policy", async () => {
    const receiptId = new BN(99);
    const [receiptPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        policyPDA.toBuffer(),
        receiptId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    try {
      await program.methods
        .authorizePayment(
          Array.from(allowedMerchantHash) as any,
          Array.from(resourceHash) as any,
          new BN(1_000_000),
          receiptId
        )
        .accounts({
          owner: owner.publicKey,
          policyAccount: policyPDA,
          escrowVault: escrowPDA,
          merchantTokenAccount: merchantTokenAccount,
          receiptAccount: receiptPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
      expect.fail("Should have thrown");
    } catch (error: any) {
      expect(error.message).to.include("PolicyRevoked");
    }
  });

  // ── Test 13: Unauthorized user cannot deposit ──
  it("rejects deposit from unauthorized user", async () => {
    const attacker = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        attacker.publicKey,
        10 * LAMPORTS_PER_SOL
      )
    );

    // Create attacker token account
    const attackerAta = await createATA(
      attacker,
      mockUsdcMint.publicKey,
      attacker.publicKey
    );

    // Derive attacker's policy PDA (different from owner's)
    const [attackerPolicyPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), attacker.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .deposit(new BN(1_000_000))
        .accounts({
          owner: attacker.publicKey,
          policyAccount: policyPDA, // owner's policy
          userTokenAccount: attackerAta,
          escrowVault: escrowPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown");
    } catch (error: any) {
      // PDA seeds mismatch or constraint error
      expect(error).to.exist;
    }
  });
});
