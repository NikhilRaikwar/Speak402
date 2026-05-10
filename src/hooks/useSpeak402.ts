import { useState, useCallback, useEffect } from 'react';
import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import type { PolicyState, ReceiptState, EscrowBalance } from '@/lib/types';
import {
  isProgramConfigured,
  formatUSDC,
  DEVNET_USDC_DECIMALS,
  DEVNET_USDC_MINT,
} from '@/lib/constants';
import {
  fetchPolicyAccount,
  fetchEscrowBalance,
  derivePolicyPDA,
  getUserUsdcBalance,
  initializePolicy as sdkInitializePolicy,
  deposit as sdkDeposit,
  authorizePayment as sdkAuthorizePayment,
  markFulfilled as sdkMarkFulfilled,
  revokePolicy as sdkRevokePolicy,
} from '@/lib/speak402SDK';
import {
  mockInitializePolicy,
  mockDeposit,
  mockAuthorizePayment,
  mockMarkFulfilled,
  mockRevokePolicy,
  getMockPolicy,
  getMockEscrowBalance,
  getMockReceipts,
} from '@/lib/mockProgram';

export type AppMode = 'devnet-usdc' | 'mock-demo';

export function useSpeak402() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const [policy, setPolicy] = useState<PolicyState | null>(null);
  const [escrowBalance, setEscrowBalance] = useState<EscrowBalance>({
    raw: 0,
    formatted: '0.00',
  });
  const [walletUsdcBalance, setWalletUsdcBalance] = useState<number>(0);
  const [receipts, setReceipts] = useState<ReceiptState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  // Determine mode: real on-chain if program is configured + wallet connected
  const programConfigured = isProgramConfigured();
  const canUseOnChain = programConfigured && connected && !!anchorWallet;
  const mode: AppMode = canUseOnChain ? 'devnet-usdc' : 'mock-demo';
  const isMockMode = mode === 'mock-demo';

  // -------------------------------------------------------------------------
  // Refresh state
  // -------------------------------------------------------------------------
  const refreshState = useCallback(async () => {
    if (canUseOnChain && anchorWallet) {
      try {
        // Fetch on-chain policy
        const p = await fetchPolicyAccount(connection, anchorWallet);
        setPolicy(p);

        // Fetch escrow balance
        if (p) {
          const [policyPDA] = derivePolicyPDA(anchorWallet.publicKey);
          const bal = await fetchEscrowBalance(connection, policyPDA);
          setEscrowBalance({ raw: bal, formatted: formatUSDC(bal) });
        } else {
          setEscrowBalance({ raw: 0, formatted: '0.00' });
        }

        // Fetch wallet USDC balance
        const usdcBal = await getUserUsdcBalance(connection, anchorWallet.publicKey);
        setWalletUsdcBalance(usdcBal);
      } catch (err) {
        console.warn('Failed to fetch on-chain state, using cached:', err);
      }
    } else {
      // Mock mode
      const p = getMockPolicy();
      setPolicy(p);
      const bal = getMockEscrowBalance();
      setEscrowBalance({ raw: bal, formatted: formatUSDC(bal) });
      setReceipts(getMockReceipts());
      setWalletUsdcBalance(100_000_000); // 100 USDC mock
    }
  }, [canUseOnChain, anchorWallet, connection]);

  useEffect(() => {
    refreshState();
  }, [refreshState, connected]);

  const clearError = useCallback(() => {
    setError(null);
    setLastTx(null);
  }, []);

  // -------------------------------------------------------------------------
  // Initialize Policy
  // -------------------------------------------------------------------------
  const initializePolicy = useCallback(
    async (params: {
      perRequestCap: number;
      dailyCap: number;
      allowedMerchant: string;
      expiresInHours: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const expiresAt = Math.floor(Date.now() / 1000) + params.expiresInHours * 3600;
        const perRequestCapRaw = Math.floor(params.perRequestCap * 10 ** DEVNET_USDC_DECIMALS);
        const dailyCapRaw = Math.floor(params.dailyCap * 10 ** DEVNET_USDC_DECIMALS);

        const hashBytes = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(params.allowedMerchant)
        );
        const merchantHash = Array.from(new Uint8Array(hashBytes));

        if (canUseOnChain && anchorWallet) {
          const txSig = await sdkInitializePolicy(connection, anchorWallet, {
            perRequestCap: new BN(perRequestCapRaw),
            dailyCap: new BN(dailyCapRaw),
            allowedMerchantHash: merchantHash,
            expiresAt: new BN(expiresAt),
          });
          setLastTx(txSig);
          await refreshState();
          return { txSignature: txSig };
        }

        // Mock fallback
        const result = await mockInitializePolicy({
          perRequestCap: perRequestCapRaw,
          dailyCap: dailyCapRaw,
          allowedMerchant: params.allowedMerchant,
          expiresAt,
          ownerAddress: publicKey?.toBase58() || 'mock-wallet',
        });
        setLastTx(result.txSignature);
        await refreshState();
        return result;
      } catch (err: any) {
        const msg = err?.message || 'Failed to initialize policy';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [canUseOnChain, anchorWallet, connection, publicKey, refreshState]
  );

  // -------------------------------------------------------------------------
  // Deposit
  // -------------------------------------------------------------------------
  const deposit = useCallback(
    async (amount: number) => {
      setLoading(true);
      setError(null);
      try {
        const amountRaw = Math.floor(amount * 10 ** DEVNET_USDC_DECIMALS);

        if (canUseOnChain && anchorWallet) {
          // Check user has enough USDC
          const userBal = await getUserUsdcBalance(connection, anchorWallet.publicKey);
          if (userBal < amountRaw) {
            throw new Error(
              `Insufficient Devnet USDC. You have ${formatUSDC(userBal)} USDC but tried to deposit ${amount} USDC. Get test USDC from faucet.circle.com.`
            );
          }

          const txSig = await sdkDeposit(connection, anchorWallet, new BN(amountRaw));
          setLastTx(txSig);
          await refreshState();
          return { txSignature: txSig };
        }

        // Mock fallback
        const result = await mockDeposit(amountRaw);
        setLastTx(result.txSignature);
        await refreshState();
        return result;
      } catch (err: any) {
        const msg = err?.message || 'Failed to deposit';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [canUseOnChain, anchorWallet, connection, refreshState]
  );

  // -------------------------------------------------------------------------
  // Authorize Payment
  // -------------------------------------------------------------------------
  const authorizePayment = useCallback(
    async (params: {
      merchantHash: number[];
      resourceHash: number[];
      amount: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        if (canUseOnChain && anchorWallet) {
          // For demo, use a deterministic merchant token account
          // In production, the merchant provides their ATA
          const merchantTokenAccount = await getAssociatedTokenAddress(
            DEVNET_USDC_MINT,
            anchorWallet.publicKey // Self-pay for demo (escrow → own wallet as merchant)
          );

          const result = await sdkAuthorizePayment(connection, anchorWallet, {
            merchantHash: params.merchantHash,
            resourceHash: params.resourceHash,
            amount: new BN(params.amount),
            merchantTokenAccount,
          });

          setLastTx(result.txSignature);
          // Build receipt for local state
          const receipt: ReceiptState = {
            receiptId: result.receiptId,
            address: result.receiptAddress,
            policy: policy?.address || '',
            owner: anchorWallet.publicKey.toBase58(),
            merchantHash: params.merchantHash,
            resourceHash: params.resourceHash,
            amount: params.amount,
            timestamp: Math.floor(Date.now() / 1000),
            fulfilled: false,
            bump: 0,
            txSignature: result.txSignature,
          };
          setReceipts((prev) => [receipt, ...prev]);
          await refreshState();
          return { receipt, txSignature: result.txSignature };
        }

        // Mock fallback
        const result = await mockAuthorizePayment(params);
        setLastTx(result.txSignature);
        await refreshState();
        return result;
      } catch (err: any) {
        const msg = err?.message || 'Payment authorization failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [canUseOnChain, anchorWallet, connection, policy, refreshState]
  );

  // -------------------------------------------------------------------------
  // Mark Fulfilled
  // -------------------------------------------------------------------------
  const markFulfilled = useCallback(
    async (receiptAddress: string, receiptId?: number) => {
      setLoading(true);
      setError(null);
      try {
        if (canUseOnChain && anchorWallet) {
          if (receiptId === undefined) {
            throw new Error('Missing receipt ID for on-chain fulfillment.');
          }
          const txSig = await sdkMarkFulfilled(
            connection,
            anchorWallet,
            new BN(receiptId)
          );
          setLastTx(txSig);

          // Update local receipt
          setReceipts((prev) =>
            prev.map((r) =>
              r.address === receiptAddress ? { ...r, fulfilled: true } : r
            )
          );
          return { txSignature: txSig };
        }

        // Mock fallback
        const result = await mockMarkFulfilled(receiptAddress);
        setLastTx(result.txSignature);
        await refreshState();
        return result;
      } catch (err: any) {
        const msg = err?.message || 'Failed to mark fulfilled';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [canUseOnChain, anchorWallet, connection, refreshState]
  );

  // -------------------------------------------------------------------------
  // Revoke Policy
  // -------------------------------------------------------------------------
  const revokePolicy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (canUseOnChain && anchorWallet) {
        const txSig = await sdkRevokePolicy(connection, anchorWallet);
        setLastTx(txSig);
        setPolicy(null);
        setEscrowBalance({ raw: 0, formatted: '0.00' });
        await refreshState();
        return { txSignature: txSig };
      }

      // Mock fallback
      const result = await mockRevokePolicy();
      setLastTx(result.txSignature);
      setPolicy(null);
      setEscrowBalance({ raw: 0, formatted: '0.00' });
      await refreshState();
      return result;
    } catch (err: any) {
      const msg = err?.message || 'Failed to revoke policy';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [canUseOnChain, anchorWallet, connection, refreshState]);

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------
  const remainingDailyAllowance = policy
    ? Math.max(0, policy.dailyCap - policy.spentToday)
    : 0;

  return {
    // State
    policy,
    escrowBalance,
    walletUsdcBalance,
    receipts,
    loading,
    error,
    lastTx,
    mode,
    isMockMode,
    remainingDailyAllowance,
    connected,
    walletAddress: publicKey?.toBase58() || null,

    // Actions
    initializePolicy,
    deposit,
    authorizePayment,
    markFulfilled,
    revokePolicy,
    refreshState,
    clearError,
  };
}
