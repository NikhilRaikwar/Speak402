import { DEVNET_USDC_MINT, X402_SERVICES, hashString } from './constants';
import type { X402Quote, X402PaidResult } from './types';

/**
 * Simulate a 402 Payment Required response from the Weather Risk Oracle.
 * In production this would be an HTTP endpoint returning 402.
 */
export async function quotePaidResource(resourceId: string): Promise<X402Quote> {
  const service = X402_SERVICES.find((item) => item.id === resourceId);
  if (!service) {
    throw new Error(`Unknown resource: ${resourceId}`);
  }

  // The deployed policy program allows one merchant domain per policy.
  // For the demo catalog, all resources are sold through the same x402 router
  // so one wallet-owned policy can authorize multiple paid resources.
  const policyMerchantDomain = X402_SERVICES[0].domain;
  const merchantHash = Array.from(await hashString(policyMerchantDomain));
  const resourceHash = Array.from(
    await hashString(service.resource.name)
  );

  return {
    merchant: service.name,
    merchantHash,
    resource: service.resource.name,
    resourceHash,
    price: service.resource.price,
    priceRaw: service.resource.priceRaw,
    network: 'Solana Devnet',
    token: 'USDC',
    mint: DEVNET_USDC_MINT.toBase58(),
    status: 402,
  };
}

/**
 * After payment is authorized on-chain, "fetch" the paid resource.
 * Simulates the merchant verifying the receipt and returning data.
 */
export function fetchPaidResource(
  receiptAddress: string,
  resourceName = 'Mumbai Weather Risk Report'
): X402PaidResult {
  const now = Date.now();
  const seed = receiptAddress
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const riskScore = 40 + (seed % 45);

  return {
    title: resourceName,
    riskScore,
    summary: generateReport(riskScore),
    recommendedAction: getRecommendation(riskScore),
    receiptAddress,
    timestamp: now,
  };
}

function generateReport(score: number): string {
  if (score >= 70) {
    return `HIGH RISK — Mumbai metropolitan area faces elevated monsoon severity this quarter. Flood probability index at ${score}%. Infrastructure stress indicators above seasonal baseline. Coastal zones show 2.1x historical surge risk. Power grid resilience rated marginal. Recommend immediate portfolio hedging and contingency activation for supply-chain-dependent operations.`;
  }
  if (score >= 55) {
    return `MODERATE RISK — Mumbai weather conditions trending above average seasonal patterns. Flood probability index at ${score}%. Intermittent disruptions expected in western suburbs and low-lying commercial districts. Transport corridors operating at 78% reliability forecast. Standard risk-management protocols sufficient; enhanced monitoring recommended.`;
  }
  return `LOW RISK — Mumbai weather patterns within normal seasonal parameters. Flood probability index at ${score}%. No significant disruptions forecast for the current assessment window. Infrastructure load indicators nominal. Standard operational posture advised. Next reassessment window in 72 hours.`;
}

function getRecommendation(score: number): string {
  if (score >= 70) return 'Activate contingency protocols. Hedge weather-dependent positions.';
  if (score >= 55) return 'Increase monitoring frequency. Review exposure limits.';
  return 'Maintain standard operations. No immediate action required.';
}
