import React from 'react';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { truncateAddress } from '@/lib/constants';

interface TransactionToastProps {
  txSignature: string | null;
  error: string | null;
  onDismiss: () => void;
}

export default function TransactionToast({
  txSignature,
  error,
  onDismiss,
}: TransactionToastProps) {
  if (!txSignature && !error) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in max-w-sm">
      {txSignature && !error && (
        <div className="bg-card border border-success/30 rounded-lg shadow-lg p-3 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Transaction Confirmed
            </p>
            <a
              href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-primary hover:underline flex items-center gap-1 mt-0.5"
            >
              {truncateAddress(txSignature, 10)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-card border border-destructive/30 rounded-lg shadow-lg p-3 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Transaction Failed
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
