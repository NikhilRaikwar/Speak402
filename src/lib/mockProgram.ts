/**
 * Mock program interactions for Mock Demo Mode fallback.
 * Used when wallet is not connected or program is not deployed.
 * All data is in-memory and resets on page refresh.
 */
import type { PolicyState, ReceiptState } from './types';
import { hashString, DEVNET_USDC_DECIMALS } from './constants';

let mockPolicy: PolicyState | null = null;
let mockEscrowBalance = 0;
let mockReceipts: ReceiptState[] = [];
let receiptCounter = 0;

function randomAddr(): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function fakeTxSig(): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 88; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function mockInitializePolicy(params: {
  perRequestCap: number;
  dailyCap: number;
  allowedMerchant: string;
  expiresAt: number;
  ownerAddress: string;
}): Promise<{ policy: PolicyState; txSignature: string }> {
  await delay(1200);
  const merchantHash = Array.from(await hashString(params.allowedMerchant));

  mockPolicy = {
    address: randomAddr(),
    owner: params.ownerAddress,
    escrowVault: randomAddr(),
    mockUsdcMint: randomAddr(),
    perRequestCap: params.perRequestCap,
    dailyCap: params.dailyCap,
    spentToday: 0,
    resetTimestamp: Math.floor(Date.now() / 1000),
    allowedMerchantHash: merchantHash,
    expiresAt: params.expiresAt,
    bump: 255,
    revoked: false,
  };
  mockEscrowBalance = 0;

  return { policy: mockPolicy, txSignature: fakeTxSig() };
}

export async function mockDeposit(amount: number): Promise<{ balance: number; txSignature: string }> {
  await delay(800);
  if (!mockPolicy) throw new Error('No policy found. Create a policy first.');
  if (amount <= 0) throw new Error('Deposit amount must be greater than 0.');

  mockEscrowBalance += amount;
  return { balance: mockEscrowBalance, txSignature: fakeTxSig() };
}

export async function mockAuthorizePayment(params: {
  merchantHash: number[];
  resourceHash: number[];
  amount: number;
}): Promise<{ receipt: ReceiptState; txSignature: string }> {
  await delay(1500);
  if (!mockPolicy) throw new Error('No policy found.');
  if (mockPolicy.revoked) throw new Error('Policy has been revoked.');

  const now = Math.floor(Date.now() / 1000);
  if (now > mockPolicy.expiresAt) throw new Error('Policy has expired.');

  const merchantMatch = mockPolicy.allowedMerchantHash.every(
    (v, i) => v === params.merchantHash[i]
  );
  if (!merchantMatch) throw new Error('Merchant not allowed by this policy.');

  if (params.amount > mockPolicy.perRequestCap)
    throw new Error(
      `Amount exceeds per-request cap (${params.amount / 10 ** DEVNET_USDC_DECIMALS} > ${mockPolicy.perRequestCap / 10 ** DEVNET_USDC_DECIMALS} USDC).`
    );

  const daySeconds = 86400;
  if (now - mockPolicy.resetTimestamp >= daySeconds) {
    mockPolicy.spentToday = 0;
    mockPolicy.resetTimestamp = now;
  }

  if (mockPolicy.spentToday + params.amount > mockPolicy.dailyCap)
    throw new Error(
      `Daily cap exceeded (${(mockPolicy.spentToday + params.amount) / 10 ** DEVNET_USDC_DECIMALS} > ${mockPolicy.dailyCap / 10 ** DEVNET_USDC_DECIMALS} USDC).`
    );

  if (params.amount > mockEscrowBalance)
    throw new Error('Insufficient escrow balance.');

  mockEscrowBalance -= params.amount;
  mockPolicy.spentToday += params.amount;

  const receipt: ReceiptState = {
    address: randomAddr(),
    policy: mockPolicy.address,
    owner: mockPolicy.owner,
    merchantHash: params.merchantHash,
    resourceHash: params.resourceHash,
    amount: params.amount,
    timestamp: now,
    fulfilled: false,
    bump: 254 - receiptCounter,
    txSignature: fakeTxSig(),
  };

  receiptCounter++;
  mockReceipts.unshift(receipt);

  return { receipt, txSignature: receipt.txSignature! };
}

export async function mockMarkFulfilled(
  receiptAddress: string
): Promise<{ txSignature: string }> {
  await delay(600);
  const receipt = mockReceipts.find((r) => r.address === receiptAddress);
  if (!receipt) throw new Error('Receipt not found.');
  receipt.fulfilled = true;
  return { txSignature: fakeTxSig() };
}

export async function mockRevokePolicy(): Promise<{ txSignature: string }> {
  await delay(800);
  if (!mockPolicy) throw new Error('No policy found.');
  mockPolicy.revoked = true;
  mockEscrowBalance = 0;
  return { txSignature: fakeTxSig() };
}

export function getMockPolicy(): PolicyState | null {
  return mockPolicy;
}

export function getMockEscrowBalance(): number {
  return mockEscrowBalance;
}

export function getMockReceipts(): ReceiptState[] {
  return [...mockReceipts];
}

export function resetMockState(): void {
  mockPolicy = null;
  mockEscrowBalance = 0;
  mockReceipts = [];
  receiptCounter = 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
