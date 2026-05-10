import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Shield, Wifi, Zap } from 'lucide-react';
import type { AppMode } from '@/hooks/useSpeak402';

interface HeaderProps {
  mode: AppMode;
}

export default function Header({ mode }: HeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold tracking-tight text-foreground">
            Speak402
          </span>
        </div>
        <span className="hidden sm:inline text-xs text-muted-foreground">
          Voice-controlled x402 payments
        </span>
      </div>

      <div className="flex items-center gap-3">
        {mode === 'devnet-usdc' ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-success/10 text-success border border-success/20">
            <Zap className="h-3 w-3" />
            Real Devnet USDC
          </span>
        ) : (
          <span className="badge-mock">Mock Demo Mode</span>
        )}
        <span className="badge-network">
          <Wifi className="h-3 w-3" />
          Devnet
        </span>
        <WalletMultiButton />
      </div>
    </header>
  );
}
