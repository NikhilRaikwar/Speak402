import React from 'react';
import { Receipt, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import type { ReceiptState } from '@/lib/types';
import { formatUSDC } from '@/lib/constants';

interface ReceiptsPanelProps {
  receipts: ReceiptState[];
}

export default function ReceiptsPanel({ receipts }: ReceiptsPanelProps) {
  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Receipts</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {receipts.length} total
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {receipts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Receipt className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              No receipts yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Receipts appear after payment authorization.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {receipts.map((receipt, i) => (
              <div
                key={receipt.address}
                className="p-3 hover:bg-secondary/30 transition-colors animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {receipt.fulfilled ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-warning" />
                    )}
                    <span className="text-xs font-semibold text-foreground">
                      {formatUSDC(receipt.amount)} USDC
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      receipt.fulfilled
                        ? 'bg-success/10 text-success'
                        : 'bg-warning/10 text-warning'
                    }`}
                  >
                    {receipt.fulfilled ? 'Fulfilled' : 'Pending'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Receipt</span>
                    <a
                      href={`https://explorer.solana.com/address/${receipt.address}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-primary hover:underline break-all inline-flex items-start gap-0.5"
                    >
                      <span>{receipt.address}</span>
                      <ExternalLink className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
                    </a>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Time</span>
                    <p className="text-foreground">
                      {new Date(receipt.timestamp * 1000).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {receipt.txSignature && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      Tx:
                    </span>
                    <a
                      href={`https://explorer.solana.com/tx/${receipt.txSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-primary hover:underline inline-flex items-start gap-0.5 break-all"
                    >
                      <span>{receipt.txSignature}</span>
                      <ExternalLink className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
