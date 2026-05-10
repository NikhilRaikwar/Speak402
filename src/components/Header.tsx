import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Shield, Wifi, Zap } from 'lucide-react';
import type { AppMode } from '@/hooks/useSpeak402';

interface HeaderProps {
  mode: AppMode;
}

export default function Header({ mode }: HeaderProps) {
  return (
    <header className="s4d-topbar">
      <div className="s4d-topbar-left">
        <div className="s4d-logo-mark">S4</div>
        <span className="s4d-app-name">Speak402</span>
        <div className="s4d-divider-v" />
        <div className="s4d-topbar-badges">
          {mode === 'devnet-usdc' ? (
            <span className="s4d-tbadge s4d-tbadge-green">
              <Zap className="h-3 w-3" />
              Real Devnet USDC
            </span>
          ) : (
            <span className="s4d-tbadge s4d-tbadge-amber">Mock Demo Mode</span>
          )}
          <span className="s4d-tbadge s4d-tbadge-green">
            <Wifi className="h-3 w-3" />
            Devnet
          </span>
        </div>
      </div>

      <div className="s4d-topbar-right">
        <Shield className="h-4 w-4 text-primary" />
        <WalletMultiButton />
      </div>
    </header>
  );
}
