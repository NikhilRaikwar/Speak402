export interface PolicyState {
  address: string;
  owner: string;
  escrowVault: string;
  mockUsdcMint: string;
  perRequestCap: number;
  dailyCap: number;
  spentToday: number;
  resetTimestamp: number;
  allowedMerchantHash: number[];
  expiresAt: number;
  bump: number;
  revoked: boolean;
}

export interface ReceiptState {
  receiptId?: number;
  address: string;
  policy: string;
  owner: string;
  merchantHash: number[];
  resourceHash: number[];
  amount: number;
  timestamp: number;
  fulfilled: boolean;
  bump: number;
  txSignature?: string;
}

export interface TranscriptEntry {
  role: 'user' | 'agent' | 'system';
  text: string;
  timestamp: number;
  metadata?: {
    merchant?: string;
    resource?: string;
    price?: number;
    remaining?: number;
    action?:
      | 'quote'
      | 'confirm'
      | 'payment'
      | 'result'
      | 'error'
      | 'services';
  };
}

export interface X402Quote {
  merchant: string;
  merchantHash: number[];
  resource: string;
  resourceHash: number[];
  price: number;
  priceRaw: number;
  network: string;
  token: string;
  mint?: string;
  status: 402;
}

export interface X402PaidResult {
  title: string;
  riskScore: number;
  summary: string;
  recommendedAction: string;
  receiptAddress: string;
  timestamp: number;
}

export type VoiceSessionStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export interface EscrowBalance {
  raw: number;
  formatted: string;
}
