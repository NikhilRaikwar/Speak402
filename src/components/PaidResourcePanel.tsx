import React, { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  Lock,
  Unlock,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEVNET_USDC_MINT, X402_SERVICES, formatUSDC } from '@/lib/constants';
import { quotePaidResource, fetchPaidResource } from '@/lib/x402';
import type { X402Quote, X402PaidResult, PolicyState, ReceiptState } from '@/lib/types';
import type { AppMode } from '@/hooks/useSpeak402';

interface PaidResourcePanelProps {
  policy: PolicyState | null;
  remainingDailyAllowance: number;
  selectedServiceId: string;
  latestFulfilledReceipt?: ReceiptState | null;
  loading: boolean;
  mode: AppMode;
  onAuthorizePayment: (params: {
    merchantHash: number[];
    resourceHash: number[];
    amount: number;
  }) => Promise<{ receipt: ReceiptState; txSignature: string }>;
  onMarkFulfilled: (receiptAddress: string, receiptId?: number) => Promise<{ txSignature: string }>;
  onAddAgentMessage: (
    text: string,
    metadata?: {
      merchant?: string;
      resource?: string;
      price?: number;
      remaining?: number;
      action?: 'quote' | 'confirm' | 'payment' | 'result' | 'error';
    }
  ) => void;
}

type PanelState = 'idle' | 'quoting' | 'quoted' | 'confirming' | 'paying' | 'paid';

export default function PaidResourcePanel({
  policy,
  remainingDailyAllowance,
  selectedServiceId,
  latestFulfilledReceipt,
  loading,
  mode,
  onAuthorizePayment,
  onMarkFulfilled,
  onAddAgentMessage,
}: PaidResourcePanelProps) {
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [quote, setQuote] = useState<X402Quote | null>(null);
  const [paidResult, setPaidResult] = useState<X402PaidResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ignoredReceiptRef = useRef<string | null>(null);
  const selectedService =
    X402_SERVICES.find((service) => service.id === selectedServiceId) ??
    X402_SERVICES[0];

  useEffect(() => {
    if (!latestFulfilledReceipt || latestFulfilledReceipt.address === ignoredReceiptRef.current) {
      return;
    }

    setPaidResult(
      fetchPaidResource(
        latestFulfilledReceipt.address,
        selectedService.resource.name
      )
    );
    setPanelState('paid');
    setError(null);
  }, [latestFulfilledReceipt, selectedService.resource.name]);

  const handleGetQuote = async () => {
    setPanelState('quoting');
    setError(null);
    try {
      const q = await quotePaidResource(selectedService.id);
      setQuote(q);
      setPanelState('quoted');
      onAddAgentMessage(
        `I found "${q.resource}" from ${q.merchant} for $${q.price} USDC. Your policy allows up to ${policy ? formatUSDC(policy.perRequestCap) : '—'} per request and ${policy ? formatUSDC(remainingDailyAllowance) : '—'} remaining today. Do you want to authorize this Solana payment?`,
        {
          merchant: q.merchant,
          resource: q.resource,
          price: q.price,
          remaining: remainingDailyAllowance,
          action: 'quote' as const,
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch quote';
      setError(message);
      setPanelState('idle');
    }
  };

  const handleConfirmPayment = async () => {
    if (!quote) return;
    setPanelState('paying');
    setError(null);
    try {
      const result = await onAuthorizePayment({
        merchantHash: quote.merchantHash,
        resourceHash: quote.resourceHash,
        amount: quote.priceRaw,
      });

      onAddAgentMessage(
        `Payment authorized. Transaction: ${result.txSignature.slice(0, 16)}... Now fetching your paid resource.`,
        { action: 'payment' as const }
      );

      await onMarkFulfilled(result.receipt.address, result.receipt.receiptId);
      const paid = fetchPaidResource(result.receipt.address, quote.resource);
      setPaidResult(paid);
      setPanelState('paid');

      onAddAgentMessage(
        `Your Mumbai Weather Risk Report is ready. Risk score: ${paid.riskScore}%. ${paid.summary.slice(0, 120)}...`,
        { action: 'result' as const }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      setError(message);
      setPanelState('quoted');
      onAddAgentMessage(`Payment failed: ${message}`, {
        action: 'error' as const,
      });
    }
  };

  const handleReset = () => {
    ignoredReceiptRef.current = latestFulfilledReceipt?.address ?? null;
    setPanelState('idle');
    setQuote(null);
    setPaidResult(null);
    setError(null);
  };

  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Paid Resource
          </h2>
        </div>
        {panelState === 'paid' ? (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-success/10 text-success">
            Unlocked
          </span>
        ) : (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-warning/10 text-warning">
            402
          </span>
        )}
      </div>

      <div className="panel-body flex-1 overflow-y-auto space-y-3">
        {/* Merchant info */}
        <div className="bg-secondary/50 rounded-md p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {selectedService.name}
          </p>
          <p className="text-sm font-semibold text-foreground">
            {selectedService.resource.name}
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {selectedService.resource.description}
          </p>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">Price</span>
            <span className="text-sm font-bold text-foreground">
              ${selectedService.resource.price} USDC
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded-md p-2.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* State: idle — 402 Payment Required */}
        {panelState === 'idle' && (
          <div className="banner-402">
            <Lock className="h-5 w-5 text-warning flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                402 Payment Required
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Accepted: Solana Devnet · USDC
                {mode === 'devnet-usdc' && (
                  <span className="block text-[10px] font-mono mt-0.5">
                    Mint: {DEVNET_USDC_MINT.toBase58().slice(0, 12)}...
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* State: quoting */}
        {panelState === 'quoting' && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">
              Fetching quote...
            </span>
          </div>
        )}

        {/* State: quoted — show quote and confirm */}
        {(panelState === 'quoted' || panelState === 'paying') && quote && (
          <div className="space-y-3">
            <div className="bg-primary/5 border border-primary/20 rounded-md p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Merchant</span>
                <span className="text-foreground font-medium">
                  {quote.merchant}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resource</span>
                <span className="text-foreground font-medium">
                  {quote.resource}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="text-foreground font-bold">
                  ${quote.price} {quote.token}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network</span>
                <span className="text-foreground">{quote.network}</span>
              </div>
              {quote.mint && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mint</span>
                  <span className="text-foreground font-mono text-[10px]">
                    {quote.mint.slice(0, 16)}...
                  </span>
                </div>
              )}
            </div>

            {panelState === 'paying' ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
                <span className="text-sm text-muted-foreground">
                  Authorizing on-chain payment...
                </span>
              </div>
            ) : (
              <Button
                onClick={handleConfirmPayment}
                disabled={loading || !policy || policy.revoked}
                className="w-full h-9 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm & Pay ${quote.price} USDC
              </Button>
            )}
          </div>
        )}

        {/* State: paid — show unlocked report */}
        {panelState === 'paid' && paidResult && (
          <div className="space-y-3 animate-fade-in">
            <div className="banner-success">
              <div className="flex items-center gap-2 mb-2">
                <Unlock className="h-4 w-4 text-success" />
                <span className="text-sm font-semibold text-foreground">
                  {paidResult.title}
                </span>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`text-2xl font-bold ${
                    paidResult.riskScore >= 70
                      ? 'text-destructive'
                      : paidResult.riskScore >= 55
                        ? 'text-warning'
                        : 'text-success'
                  }`}
                >
                  {paidResult.riskScore}%
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Risk Score
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Flood probability index
                  </p>
                </div>
              </div>

              <p className="text-xs text-foreground leading-relaxed">
                {paidResult.summary}
              </p>

              <div className="mt-2 pt-2 border-t border-success/20">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                  Recommended Action
                </p>
                <p className="text-xs text-foreground">
                  {paidResult.recommendedAction}
                </p>
              </div>

              <div className="mt-2 pt-2 border-t border-success/20">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Receipt
                </p>
                <a
                  href={`https://explorer.solana.com/address/${paidResult.receiptAddress}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-primary hover:underline break-all inline-flex items-start gap-1"
                >
                  <span>{paidResult.receiptAddress}</span>
                  <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0" />
                </a>
              </div>
            </div>

            <Button
              onClick={handleReset}
              variant="outline"
              className="w-full h-7 text-xs text-muted-foreground"
            >
              <ArrowRight className="h-3 w-3 mr-1" />
              Purchase Another Resource
            </Button>
          </div>
        )}

        {/* Action button */}
        {panelState === 'idle' && (
          <Button
            onClick={handleGetQuote}
            disabled={!policy || policy.revoked}
            className="w-full h-9 text-sm bg-foreground text-background hover:bg-foreground/90"
          >
            Request Quote
          </Button>
        )}

        {!policy && panelState === 'idle' && (
          <p className="text-xs text-muted-foreground text-center">
            Create a spending policy first to purchase resources.
          </p>
        )}
      </div>
    </div>
  );
}
