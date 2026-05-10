import React from 'react';
import { Wallet, FileCheck, Clock, DollarSign, Coins } from 'lucide-react';
import type { PolicyState, EscrowBalance, ReceiptState } from '@/lib/types';
import type { AppMode } from '@/hooks/useSpeak402';
import { formatUSDC, truncateAddress } from '@/lib/constants';

interface StatusBarProps {
  policy: PolicyState | null;
  escrowBalance: EscrowBalance;
  receipts: ReceiptState[];
  remainingDailyAllowance: number;
  walletUsdcBalance: number;
  mode: AppMode;
}

export default function StatusBar({
  policy,
  escrowBalance,
  receipts,
  remainingDailyAllowance,
  walletUsdcBalance,
  mode,
}: StatusBarProps) {
  const latestReceipt = receipts[0] || null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Policy Status */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <FileCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="stat-label">Policy</span>
        </div>
        {policy ? (
          <div>
            <span
              className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                policy.revoked
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-success/10 text-success'
              }`}
            >
              {policy.revoked ? 'Revoked' : 'Active'}
            </span>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {truncateAddress(policy.address, 6)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No policy</p>
        )}
      </div>

      {/* Wallet USDC Balance */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <Coins className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="stat-label">Wallet USDC</span>
        </div>
        <p className="stat-value text-xl">{formatUSDC(walletUsdcBalance)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {mode === 'devnet-usdc' ? 'Devnet USDC' : 'Mock balance'}
        </p>
      </div>

      {/* Escrow Balance */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="stat-label">Escrow</span>
        </div>
        <p className="stat-value text-xl">{escrowBalance.formatted}</p>
        <p className="text-xs text-muted-foreground mt-0.5">USDC deposited</p>
      </div>

      {/* Daily Remaining */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="stat-label">Daily Remaining</span>
        </div>
        <p className="stat-value text-xl">
          {policy ? formatUSDC(remainingDailyAllowance) : '—'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {policy
            ? `of ${formatUSDC(policy.dailyCap)} daily cap`
            : 'No policy set'}
        </p>
      </div>

      {/* Latest Receipt */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="stat-label">Last Receipt</span>
        </div>
        {latestReceipt ? (
          <div>
            <p className="text-sm font-semibold text-foreground">
              {formatUSDC(latestReceipt.amount)} USDC
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {truncateAddress(latestReceipt.address, 6)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">None yet</p>
        )}
      </div>
    </div>
  );
}
