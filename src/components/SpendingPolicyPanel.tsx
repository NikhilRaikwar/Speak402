import React, { useState } from 'react';
import {
  Shield,
  Plus,
  Coins,
  XCircle,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PolicyState, EscrowBalance } from '@/lib/types';
import type { AppMode } from '@/hooks/useSpeak402';
import {
  formatUSDC,
  truncateAddress,
  DEMO_MERCHANT,
} from '@/lib/constants';

interface SpendingPolicyPanelProps {
  policy: PolicyState | null;
  escrowBalance: EscrowBalance;
  remainingDailyAllowance: number;
  walletUsdcBalance: number;
  loading: boolean;
  mode: AppMode;
  onCreatePolicy: (params: {
    perRequestCap: number;
    dailyCap: number;
    allowedMerchant: string;
    expiresInHours: number;
  }) => Promise<any>;
  onDeposit: (amount: number) => Promise<any>;
  onRevoke: () => Promise<any>;
}

export default function SpendingPolicyPanel({
  policy,
  remainingDailyAllowance,
  walletUsdcBalance,
  loading,
  mode,
  onCreatePolicy,
  onDeposit,
  onRevoke,
}: SpendingPolicyPanelProps) {
  const [perRequestCap, setPerRequestCap] = useState('1.00');
  const [dailyCap, setDailyCap] = useState('5.00');
  const [allowedMerchant, setAllowedMerchant] = useState(DEMO_MERCHANT.domain);
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [depositAmount, setDepositAmount] = useState('10.00');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCreatePolicy = async () => {
    await onCreatePolicy({
      perRequestCap: parseFloat(perRequestCap),
      dailyCap: parseFloat(dailyCap),
      allowedMerchant,
      expiresInHours: parseInt(expiresInHours),
    });
  };

  const handleDeposit = async () => {
    await onDeposit(parseFloat(depositAmount));
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => copyToClipboard(text, field)}
      className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
    >
      {copiedField === field ? (
        <Check className="h-3 w-3 text-success" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );

  const hasInsufficientUsdc =
    mode === 'devnet-usdc' && walletUsdcBalance === 0;
  const activePolicy = policy && !policy.revoked ? policy : null;

  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Spending Policy
          </h2>
        </div>
        {activePolicy && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-success/10 text-success">
            Active
          </span>
        )}
      </div>

      <div className="panel-body flex-1 overflow-y-auto space-y-4">
        {/* USDC funding notice */}
        {hasInsufficientUsdc && !activePolicy && (
          <div className="bg-info/5 border border-info/20 rounded-md p-2.5 text-xs">
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-info flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">
                  You need Devnet USDC to fund this policy.
                </p>
                <p className="text-muted-foreground mt-0.5">
                  Get free test USDC from the Circle faucet:
                </p>
                <a
                  href="https://faucet.circle.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 mt-1"
                >
                  faucet.circle.com
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {!activePolicy ? (
          <div className="space-y-3">
            {policy?.revoked && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3 text-xs text-destructive">
                Previous policy was revoked. Create a new policy to continue.
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">
                Per-request cap (USDC)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={perRequestCap}
                onChange={(e) => setPerRequestCap(e.target.value)}
                className="mt-1 h-8 text-sm"
                placeholder="1.00"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Daily cap (USDC)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={dailyCap}
                onChange={(e) => setDailyCap(e.target.value)}
                className="mt-1 h-8 text-sm"
                placeholder="5.00"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Allowed merchant domain
              </Label>
              <Input
                value={allowedMerchant}
                onChange={(e) => setAllowedMerchant(e.target.value)}
                className="mt-1 h-8 text-sm font-mono"
                placeholder="oracle.speak402.demo"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Expires in (hours)
              </Label>
              <Input
                type="number"
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value)}
                className="mt-1 h-8 text-sm"
                placeholder="24"
              />
            </div>
            <Button
              onClick={handleCreatePolicy}
              disabled={loading}
              className="w-full h-9 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Policy
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Address info */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Policy PDA</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-foreground">
                    {truncateAddress(activePolicy.address, 6)}
                  </span>
                  <CopyButton text={activePolicy.address} field="policy" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Escrow Vault</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-foreground">
                    {truncateAddress(activePolicy.escrowVault, 6)}
                  </span>
                  <CopyButton text={activePolicy.escrowVault} field="escrow" />
                </div>
              </div>
            </div>

            {/* Caps */}
            <div className="bg-secondary/50 rounded-md p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Per-request cap</span>
                <span className="font-semibold text-foreground">
                  {formatUSDC(activePolicy.perRequestCap)} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily cap</span>
                <span className="font-semibold text-foreground">
                  {formatUSDC(activePolicy.dailyCap)} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Spent today</span>
                <span className="font-semibold text-foreground">
                  {formatUSDC(activePolicy.spentToday)} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-semibold text-primary">
                  {formatUSDC(remainingDailyAllowance)} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expires</span>
                <span className="text-foreground">
                  {new Date(activePolicy.expiresAt * 1000).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Deposit */}
            {activePolicy && (
              <div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="h-8 text-sm flex-1"
                    placeholder="Amount"
                  />
                  <Button
                    onClick={handleDeposit}
                    disabled={loading}
                    size="sm"
                    className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {loading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Coins className="h-3 w-3 mr-1" />
                    )}
                    Deposit
                  </Button>
                </div>
                {mode === 'devnet-usdc' && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Wallet: {formatUSDC(walletUsdcBalance)} USDC available
                  </p>
                )}
              </div>
            )}

            {/* Revoke */}
            {activePolicy && (
              <Button
                onClick={onRevoke}
                disabled={loading}
                variant="outline"
                className="w-full h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <XCircle className="h-3 w-3 mr-1" />
                )}
                Revoke Policy & Withdraw
              </Button>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
