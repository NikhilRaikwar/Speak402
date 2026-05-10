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
    <div className="s4d-demo-wrap">
      <div className="s4d-demo-title">
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
      <div className="s4d-demo-flow">
          {steps.map((step, i) => (
            <React.Fragment key={i}>
              <div className="s4d-flow-step">
                <div
                  className={`s4d-flow-circle ${
                    step.done
                      ? 's4d-fc-done'
                      : i === currentStep
                        ? 's4d-fc-active'
                        : 's4d-fc-inactive'
                  }`}
                >
                  {step.done ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`s4d-flow-label ${
                    step.done
                      ? 's4d-flow-label-done'
                      : i === currentStep
                        ? 's4d-flow-label-active'
                        : 's4d-flow-label-inactive'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="s4d-flow-arrow" />
              )}
            </React.Fragment>
          ))}
      </div>
    </div>
  );
}
