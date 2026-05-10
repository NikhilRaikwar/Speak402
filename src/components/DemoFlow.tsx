import React from 'react';
import { Zap, ArrowRight, Check } from 'lucide-react';
import type { AppMode } from '@/hooks/useSpeak402';

interface DemoFlowProps {
  hasPolicy: boolean;
  hasEscrow: boolean;
  mode: AppMode;
}

export default function DemoFlow({
  hasPolicy,
  hasEscrow,
  mode,
}: DemoFlowProps) {
  const steps = [
    {
      label: 'Connect wallet',
      done: true,
    },
    { label: 'Create spending policy', done: hasPolicy },
    { label: mode === 'devnet-usdc' ? 'Deposit Devnet USDC' : 'Deposit USDC (mock)', done: hasEscrow },
    { label: 'Request resource quote', done: false },
    { label: 'Confirm & pay', done: false },
  ];

  const currentStep = steps.findIndex((s) => !s.done);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Demo Flow
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
        </span>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {steps.map((step, i) => (
            <React.Fragment key={i}>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                    step.done
                      ? 'bg-primary text-primary-foreground'
                      : i === currentStep
                        ? 'bg-foreground text-background'
                        : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {step.done ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-xs whitespace-nowrap ${
                    step.done
                      ? 'text-primary font-medium'
                      : i === currentStep
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0 mx-1" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
