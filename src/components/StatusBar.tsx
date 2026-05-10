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
    <div className="s4d-status-row">
      {/* Policy Status */}
      <div className="s4d-status-cell">
        <div className="s4d-sc-label">
          <FileCheck className="h-3.5 w-3.5 text-muted-foreground" />
          Policy
        </div>
        {policy ? (
          <div>
            <span
              className={`s4d-sc-chip ${
                policy.revoked
                  ? 's4d-chip-red'
                  : 's4d-chip-green'
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
      <div className="s4d-status-cell">
        <div className="s4d-sc-label">
          <Coins className="h-3.5 w-3.5 text-muted-foreground" />
          Wallet USDC
        </div>
        <p className="s4d-sc-value">{formatUSDC(walletUsdcBalance)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {mode === 'devnet-usdc' ? 'Devnet USDC' : 'Mock balance'}
        </p>
      </div>

      {/* Escrow Balance */}
      <div className="s4d-status-cell">
        <div className="s4d-sc-label">
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          Escrow
        </div>
        <p className="s4d-sc-value">{escrowBalance.formatted}</p>
        <p className="text-xs text-muted-foreground mt-0.5">USDC deposited</p>
      </div>

      {/* Daily Remaining */}
      <div className="s4d-status-cell">
        <div className="s4d-sc-label">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          Daily Remaining
        </div>
        <p className="s4d-sc-value text-primary">
          {policy ? formatUSDC(remainingDailyAllowance) : '—'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {policy
            ? `of ${formatUSDC(policy.dailyCap)} daily cap`
            : 'No policy set'}
        </p>
      </div>

      {/* Latest Receipt */}
      <div className="s4d-status-cell">
        <div className="s4d-sc-label">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          Last Receipt
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
