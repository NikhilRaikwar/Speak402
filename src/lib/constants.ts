import { PublicKey } from '@solana/web3.js';

// ---------------------------------------------------------------------------
// Program & Network
// ---------------------------------------------------------------------------
export const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID || 'CQMQ2Z26ueLm7hNa2rFGADtdLhURSN9MfcUTDqCjkni4'
);

export const SOLANA_RPC_URL: string =
  import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// ---------------------------------------------------------------------------
// Devnet USDC  (Circle's official Devnet USDC mint)
// Users can get test USDC from https://faucet.circle.com/
// Fallback: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU is USDC-Dev on Devnet
// ---------------------------------------------------------------------------
export const DEVNET_USDC_MINT = new PublicKey(
  import.meta.env.VITE_DEVNET_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);
export const DEVNET_USDC_DECIMALS = 6;
export const DEVNET_USDC_SYMBOL = 'USDC';

/** @deprecated Use DEVNET_USDC_MINT instead */
export const MOCK_USDC_MINT = DEVNET_USDC_MINT;
/** @deprecated Use DEVNET_USDC_DECIMALS instead */
export const MOCK_USDC_DECIMALS = DEVNET_USDC_DECIMALS;

// ---------------------------------------------------------------------------
// ElevenLabs
// ---------------------------------------------------------------------------
export const ELEVENLABS_AGENT_ID: string =
  import.meta.env.VITE_ELEVENLABS_AGENT_ID || '';

const configuredElevenLabsConnectionType =
  import.meta.env.VITE_ELEVENLABS_CONNECTION_TYPE || 'webrtc';

export const ELEVENLABS_CONNECTION_TYPE: 'webrtc' | 'websocket' =
  configuredElevenLabsConnectionType === 'websocket' ? 'websocket' : 'webrtc';

// ---------------------------------------------------------------------------
// SPL Token Program
// ---------------------------------------------------------------------------
export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
);

// ---------------------------------------------------------------------------
// Demo x402 services
// ---------------------------------------------------------------------------
export const X402_SERVICES = [
  {
    id: 'weather-risk-oracle',
    name: 'Weather Risk Oracle',
    category: 'Risk Data',
    domain: 'oracle.speak402.demo',
    resource: {
      name: 'Mumbai Weather Risk Report',
      price: 0.25,
      priceRaw: 250_000,
      description:
        'Comprehensive weather risk assessment for Mumbai metropolitan region. Includes flood risk index, monsoon forecast severity, infrastructure impact score, and insurance recommendation.',
    },
  },
  {
    id: 'defi-yield-screener',
    name: 'DeFi Yield Screener',
    category: 'DeFi Intel',
    domain: 'yield.speak402.demo',
    resource: {
      name: 'Solana Stable Yield Snapshot',
      price: 0.35,
      priceRaw: 350_000,
      description:
        'Agent-readable scan of Solana stablecoin lending pools, utilization, reward risk, and available liquidity for treasury routing.',
    },
  },
  {
    id: 'wallet-risk-lens',
    name: 'Wallet Risk Lens',
    category: 'Compliance',
    domain: 'risk.speak402.demo',
    resource: {
      name: 'Counterparty Wallet Risk Brief',
      price: 0.15,
      priceRaw: 150_000,
      description:
        'Pre-transaction wallet risk brief for agent workflows, including recent token activity, interaction flags, and confidence score.',
    },
  },
] as const;

export const DEMO_MERCHANT = X402_SERVICES[0];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 hash of a string → Uint8Array(32) */
export async function hashString(input: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return new Uint8Array(digest);
}

/** Format raw token units (6 decimals) to display USDC string */
export function formatUSDC(raw: number | bigint): string {
  const num = Number(raw) / 10 ** DEVNET_USDC_DECIMALS;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

/** Truncate a pubkey or tx signature for display */
export function truncateAddress(addr: string, chars = 4): string {
  if (!addr) return '';
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

/** Check if program is configured (not system program placeholder) */
export function isProgramConfigured(): boolean {
  return PROGRAM_ID.toBase58() !== '11111111111111111111111111111111';
}
