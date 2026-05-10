import React, { useCallback, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  Bot,
  CheckCircle2,
  CreditCard,
  History,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Mic,
  Receipt,
  Shield,
  Zap,
} from 'lucide-react';
import Header from '@/components/Header';
import StatusBar from '@/components/StatusBar';
import DemoFlow from '@/components/DemoFlow';
import SpendingPolicyPanel from '@/components/SpendingPolicyPanel';
import VoiceAgentPanel from '@/components/VoiceAgentPanel';
import PaidResourcePanel from '@/components/PaidResourcePanel';
import ReceiptsPanel from '@/components/ReceiptsPanel';
import TransactionToast from '@/components/TransactionToast';
import { Button } from '@/components/ui/button';
import { X402_SERVICES } from '@/lib/constants';
import { useSpeak402 } from '@/hooks/useSpeak402';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';

type DashboardSection = 'setup' | 'agent' | 'services' | 'receipts';

const sidebarItems: Array<{
  id: DashboardSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'setup', label: 'Policy Setup', icon: Shield },
  { id: 'agent', label: 'Voice Agent', icon: Mic },
  { id: 'services', label: 'x402 Services', icon: LayoutDashboard },
  { id: 'receipts', label: 'Receipts', icon: Receipt },
];

export default function Index() {
  const { connected } = useWallet();
  const [activeSection, setActiveSection] = useState<DashboardSection>('setup');
  const [selectedServiceId, setSelectedServiceId] = useState(X402_SERVICES[0].id);

  const {
    policy,
    escrowBalance,
    walletUsdcBalance,
    receipts,
    loading,
    error,
    lastTx,
    mode,
    remainingDailyAllowance,
    initializePolicy,
    deposit,
    authorizePayment,
    markFulfilled,
    revokePolicy,
    clearError,
  } = useSpeak402();

  const latestFulfilledReceipt = useMemo(
    () => receipts.find((receipt) => receipt.fulfilled) ?? null,
    [receipts]
  );

  const {
    status,
    transcript,
    isSessionActive,
    isConfigured,
    startSession,
    endSession,
    sendSimulatedMessage,
    addAgentMessage,
  } = useVoiceAgent({
    policy,
    remainingDailyAllowance,
    selectedServiceId,
    onSelectService: setSelectedServiceId,
    onAuthorizePayment: authorizePayment,
    onMarkFulfilled: markFulfilled,
  });

  const hasReadyPolicy = Boolean(policy && !policy.revoked && escrowBalance.raw > 0);

  const handleDismissToast = useCallback(() => {
    clearError();
  }, [clearError]);

  if (!connected) {
    return <LandingPage />;
  }

  return (
    <div className="s4-dashboard min-h-screen flex flex-col">
      <Header mode={mode} />

      <div className="s4d-layout">
        <aside className="s4d-sidebar">
          <div className="s4d-sidebar-section">
            <p className="s4d-sidebar-kicker">
              Workspace
            </p>
            <p className="s4d-sidebar-title">
              Agent Payment OS
            </p>
          </div>
          <nav className="s4d-sidebar-nav">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              const disabled = !hasReadyPolicy && item.id !== 'setup';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => !disabled && setActiveSection(item.id)}
                  disabled={disabled}
                  className={`s4d-nav-item ${
                    active
                      ? 'active'
                      : disabled
                        ? 'disabled'
                        : ''
                  }`}
                >
                  <Icon className="s4d-nav-icon" />
                  <span className="s4d-nav-label">{item.label}</span>
                  {active && <span className="s4d-badge-dot" />}
                </button>
              );
            })}
          </nav>
          <div className="s4d-sidebar-footer">
            <div className="s4d-sf-card">
              <p className="s4d-sf-label">
                Hackathon Edge
              </p>
              <p className="s4d-sf-text">
                Custom Rust policy program + ElevenLabs voice + x402 service
                marketplace.
              </p>
            </div>
          </div>
        </aside>

        <main className="s4d-main">
          <MobileSectionNav
            activeSection={activeSection}
            onChange={setActiveSection}
            disabled={!hasReadyPolicy}
          />

          <StatusBar
            policy={policy}
            escrowBalance={escrowBalance}
            receipts={receipts}
            remainingDailyAllowance={remainingDailyAllowance}
            walletUsdcBalance={walletUsdcBalance}
            mode={mode}
          />

          {activeSection === 'setup' && (
            <section className="s4d-section-stack">
              <DemoFlow
                hasPolicy={!!policy && !policy.revoked}
                hasEscrow={escrowBalance.raw > 0}
                mode={mode}
              />
              <div className="s4d-setup-grid">
                <div>
                  <SpendingPolicyPanel
                    policy={policy}
                    escrowBalance={escrowBalance}
                    remainingDailyAllowance={remainingDailyAllowance}
                    walletUsdcBalance={walletUsdcBalance}
                    loading={loading}
                    mode={mode}
                    onCreatePolicy={initializePolicy}
                    onDeposit={deposit}
                    onRevoke={revokePolicy}
                  />
                </div>
                <div>
                  <OnboardingPanel hasReadyPolicy={hasReadyPolicy} />
                </div>
              </div>
            </section>
          )}

          {activeSection === 'agent' && (
            <section className="s4d-three-panels">
              <div>
                <VoiceAgentPanel
                  status={status}
                  transcript={transcript}
                  isSessionActive={isSessionActive}
                  isConfigured={isConfigured}
                  onStartSession={startSession}
                  onEndSession={endSession}
                  onSendMessage={sendSimulatedMessage}
                />
              </div>
              <div>
                <ServiceCatalog
                  selectedServiceId={selectedServiceId}
                  onSelectService={setSelectedServiceId}
                />
              </div>
              <div>
                <PaidResourcePanel
                  policy={policy}
                  remainingDailyAllowance={remainingDailyAllowance}
                  selectedServiceId={selectedServiceId}
                  latestFulfilledReceipt={latestFulfilledReceipt}
                  loading={loading}
                  mode={mode}
                  onAuthorizePayment={authorizePayment}
                  onMarkFulfilled={markFulfilled}
                  onAddAgentMessage={addAgentMessage}
                />
              </div>
            </section>
          )}

          {activeSection === 'services' && (
            <section className="s4d-two-panels">
              <div>
                <ServiceCatalog
                  selectedServiceId={selectedServiceId}
                  onSelectService={setSelectedServiceId}
                />
              </div>
              <div>
                <PaidResourcePanel
                  policy={policy}
                  remainingDailyAllowance={remainingDailyAllowance}
                  selectedServiceId={selectedServiceId}
                  latestFulfilledReceipt={latestFulfilledReceipt}
                  loading={loading}
                  mode={mode}
                  onAuthorizePayment={authorizePayment}
                  onMarkFulfilled={markFulfilled}
                  onAddAgentMessage={addAgentMessage}
                />
              </div>
            </section>
          )}

          {activeSection === 'receipts' && (
            <section className="s4d-two-panels">
              <div>
                <ReceiptsPanel receipts={receipts} />
              </div>
              <div>
                <ReceiptExplainer />
              </div>
            </section>
          )}
        </main>
      </div>

      <TransactionToast
        txSignature={lastTx}
        error={error}
        onDismiss={handleDismissToast}
      />
    </div>
  );
}

function LandingPage() {
  return (
    <div className="speak402-landing">
      <div className="s4-grid-bg" />

      <nav className="s4-nav">
        <div className="s4-nav-inner">
          <a href="#" className="s4-logo">
            <div className="s4-logo-icon">S4</div>
            <div>
              <div className="s4-logo-text">Speak402</div>
              <div className="s4-logo-sub">x402 · Solana · ElevenLabs</div>
            </div>
          </a>
          <div className="s4-nav-links">
            <a href="#policy" className="s4-link">Policy</a>
            <a href="#services" className="s4-link">Services</a>
            <a href="#receipts" className="s4-link">Receipts</a>
            <WalletMultiButton />
          </div>
        </div>
      </nav>

      <div className="s4-hero-wrap">
        <div className="s4-hero-glow" />
        <div className="s4-hero">
          <div className="s4-fade-up">
            <div className="s4-badge-row">
              <span className="s4-badge s4-badge-green">⚡ Solana Devnet</span>
              <span className="s4-badge s4-badge-amber">🎙 ElevenLabs Agent</span>
              <span className="s4-badge s4-badge-purple">x402 Bonus Ready</span>
            </div>

            <h1 className="s4-h1">
              Give voice agents<br />a wallet<br />
              <span className="s4-accent">they can't overspend.</span>
            </h1>

            <p className="s4-hero-desc">
              Speak402 lets users set a wallet-owned Solana spending policy,
              then ask an ElevenLabs agent to buy paid x402 resources - governed
              by on-chain caps the agent cannot bypass.
            </p>

            <div className="s4-cta-row">
              <WalletMultiButton />
              <a href="#process" className="s4-btn-outline">See payment flow →</a>
            </div>

            <div className="s4-hero-stats">
              <div className="s4-stat-item">
                <div className="s4-stat-val">13</div>
                <div className="s4-stat-lab">Passing tests</div>
              </div>
              <div className="s4-stat-item">
                <div className="s4-stat-val">$0.15</div>
                <div className="s4-stat-lab">Min payment</div>
              </div>
              <div className="s4-stat-item">
                <div className="s4-stat-val">&lt;1s</div>
                <div className="s4-stat-lab">Finality</div>
              </div>
            </div>
          </div>

          <div className="s4-hero-card s4-fade-up s4-delay">
            <div className="s4-hero-card-header">
              <div className="s4-dots">
                <div className="s4-dot s4-dot-r" />
                <div className="s4-dot s4-dot-y" />
                <div className="s4-dot s4-dot-g" />
              </div>
              <div className="s4-card-title">Speak402 - Voice Session</div>
              <div className="s4-chip"><span className="s4-live-dot s4-live-dot-sm" /> Devnet</div>
            </div>
            <div className="s4-card-body">
              <div className="s4-msg s4-msg-agent">
                <div className="s4-msg-label s4-msg-label-a">▸ SPEAK402</div>
                Hi! I can list x402 services, quote prices against your on-chain
                policy, and authorize Devnet USDC payments. What would you like
                to buy?
              </div>
              <div className="s4-msg s4-msg-user">
                <div className="s4-msg-label s4-msg-label-u">▸ YOU</div>
                Buy the Mumbai weather risk report.
              </div>
              <div className="s4-msg s4-msg-agent">
                <div className="s4-msg-label s4-msg-label-a">▸ SPEAK402</div>
                402 quote ready: <strong>Mumbai Weather Risk Report</strong> from
                Weather Risk Oracle for <strong className="s4-green">$0.25 USDC</strong>.
                Remaining daily allowance: <strong>$4.75</strong>. Say yes to authorize.
              </div>
              <div className="s4-msg s4-msg-user">
                <div className="s4-msg-label s4-msg-label-u">▸ YOU</div>
                Yes. Authorize it.
              </div>
              <div className="s4-card-grid">
                <div className="s4-card-cell">
                  <div className="s4-cell-lab">STATUS</div>
                  <div className="s4-cell-val s4-green">✓ Fulfilled</div>
                </div>
                <div className="s4-card-cell">
                  <div className="s4-cell-lab">AMOUNT</div>
                  <div className="s4-cell-val">0.25 USDC</div>
                </div>
                <div className="s4-card-cell">
                  <div className="s4-cell-lab">RISK SCORE</div>
                  <div className="s4-cell-val s4-amber">67% - HIGH</div>
                </div>
                <div className="s4-card-cell">
                  <div className="s4-cell-lab">RECEIPT</div>
                  <div className="s4-cell-val s4-mono s4-green">7xKp...r4Qm ↗</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="s4-strip">
        <div className="s4-strip-inner">
          <div className="s4-strip-item">
            <div className="s4-strip-label">Colosseum insight</div>
            <div className="s4-strip-text">x402 API gateways are crowded. User safety - voice UX, policy caps, receipt audit - is the winning wedge.</div>
          </div>
          <div className="s4-strip-item">
            <div className="s4-strip-label">Solana primitive</div>
            <div className="s4-strip-text">PolicyAccount + EscrowVault + MerchantReceipt - three PDAs enforced by Rust, owned by the wallet, not a backend.</div>
          </div>
          <div className="s4-strip-item">
            <div className="s4-strip-label">Demo artifact</div>
            <div className="s4-strip-text">Quote → Phantom signing → unlocked result → fulfilled receipt → updated daily allowance. Every step on-chain.</div>
          </div>
        </div>
      </div>

      <section id="policy" className="s4-section">
        <div className="s4-section-inner">
          <div className="s4-eyebrow">Core design</div>
          <h2 className="s4-h2">The policy controls the agent.<br />Not the other way around.</h2>
          <p className="s4-section-desc">Speak402 leads with wallet-owned spending policy - not a chatbot. That is the Solana-native primitive judges need to see.</p>
          <div className="s4-features-grid">
            <div className="s4-feature">
              <div className="s4-feature-icon">🔐</div>
              <h3>Policy before payment</h3>
              <p>Create per-request caps, daily caps, merchant restrictions, and expiry - all enforced by the Rust program, not a database permission.</p>
            </div>
            <div className="s4-feature">
              <div className="s4-feature-icon">🎙️</div>
              <h3>Voice agent with real tools</h3>
              <p>ElevenLabs agent calls five client tools: list services, quote, authorize payment, mark fulfilled, get receipt. Never invents data.</p>
            </div>
            <div className="s4-feature">
              <div className="s4-feature-icon">📋</div>
              <h3>Receipts that prove it</h3>
              <p>Every purchase ends with a MerchantReceipt PDA, transaction signature, and clickable Devnet Explorer link - verifiable by anyone.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="process" className="s4-section s4-process-section">
        <div className="s4-section-inner">
          <div className="s4-eyebrow">Policy-first demo flow</div>
          <h2 className="s4-h2">A path judges follow without explanation.</h2>
          <p className="s4-section-desc">Every screen answers one question: who controls the agent, what can it buy, what did it pay, where is the proof?</p>
          <div className="s4-process-grid">
            <div className="s4-step">
              <div className="s4-step-num">01 - CONNECT</div>
              <h3>Connect wallet</h3>
              <p>Phantom on Devnet. No account creation. No API key subscription. No agent custody.</p>
            </div>
            <div className="s4-step">
              <div className="s4-step-num">02 - POLICY</div>
              <h3>Create policy</h3>
              <p>Deposit Devnet USDC. Define exact caps the agent is allowed to spend. Enforced on-chain.</p>
            </div>
            <div className="s4-step">
              <div className="s4-step-num">03 - SPEAK</div>
              <h3>Ask the agent</h3>
              <p>Say what you need. The agent picks a paid x402 service, reads the quote, and waits for confirmation.</p>
            </div>
            <div className="s4-step">
              <div className="s4-step-num">04 - VERIFY</div>
              <h3>Sign and unlock</h3>
              <p>Approve in Phantom. Paid resource unlocks. Receipt PDA created. Daily allowance updates.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="s4-section">
        <div className="s4-section-inner">
          <div className="s4-eyebrow">x402 Service Catalog</div>
          <h2 className="s4-h2">The agent picks from a catalog,<br />not one scripted demo.</h2>
          <p className="s4-section-desc">Three paid resources with different merchants, prices, and result types. One wallet-owned policy authorizes all of them.</p>
          <div className="s4-services-grid">
            {X402_SERVICES.map((service) => (
              <div className="s4-service-card" key={service.id}>
                <div className="s4-service-badge">{service.category}</div>
                <h3>{service.resource.name}</h3>
                <p>{service.resource.description}</p>
                <div className="s4-service-footer">
                  <span className="s4-service-domain">{service.domain}</span>
                  <span className="s4-service-price">${service.resource.price} USDC</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="receipts" className="s4-section s4-receipts-section">
        <div className="s4-section-inner">
          <div className="s4-receipts-split">
            <div>
              <div className="s4-eyebrow">Audit trail</div>
              <h2 className="s4-h2">Receipts turn a voice conversation into verifiable payment history.</h2>
              <p className="s4-receipt-copy">The agent cannot merely say "done." The app shows receipt PDA, fulfillment state, transaction signature, and remaining daily allowance after each Solana payment.</p>
              <div className="s4-tech-grid">
                <div className="s4-tech-card">
                  <h4>Checked math</h4>
                  <p>All on-chain arithmetic uses checked_add / checked_sub. Zero overflow risk.</p>
                </div>
                <div className="s4-tech-card">
                  <h4>PDA authority</h4>
                  <p>Escrow vault is owned by the program's PDA. No backend can withdraw.</p>
                </div>
                <div className="s4-tech-card">
                  <h4>Daily reset</h4>
                  <p>spent_today resets every 86400s from reset_timestamp. Automatic, on-chain.</p>
                </div>
              </div>
            </div>
            <div className="s4-receipt-card">
              <div className="s4-receipt-header">
                <h3>💳 MerchantReceipt PDA</h3>
                <span className="s4-status-chip">✓ Fulfilled</span>
              </div>
              <div className="s4-receipt-rows">
                {[
                  ['Merchant', 'Weather Risk Oracle'],
                  ['Resource', 'Mumbai Weather Risk Report'],
                  ['Amount', '0.25 USDC'],
                  ['Network', 'Solana Devnet'],
                  ['Receipt PDA', '7xKp4r...mQn2 ↗ Explorer'],
                  ['Tx Signature', '3aRnW9...kB4j ↗ Explorer'],
                  ['Daily Remaining', '4.75 USDC'],
                ].map(([key, value]) => (
                  <div className="s4-receipt-row" key={key}>
                    <span className="s4-receipt-key">{key}</span>
                    <span className={key.includes('PDA') || key.includes('Tx') ? 's4-receipt-val s4-receipt-link' : 's4-receipt-val'}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="s4-cta-section">
        <div className="s4-eyebrow">Ready?</div>
        <h2 className="s4-h2">Give the agent a bounded wallet.</h2>
        <p>Connect Phantom and the app guides you into policy setup first. Policy before agent. Always.</p>
        <div className="s4-cta-center">
          <WalletMultiButton />
          <a href="https://github.com/NikhilRaikwar/Speak402" className="s4-btn-outline">GitHub →</a>
        </div>
      </div>

      <footer className="s4-footer">
        <div>
          Speak402 · Built for <a href="https://solana.com">Solana Hackathon</a> ·
          Program: <a href="https://explorer.solana.com/address/CQMQ2Z26ueLm7hNa2rFGADtdLhURSN9MfcUTDqCjkni4?cluster=devnet">CQMQ2Z26...ni4</a> · Devnet ·
          <a href="https://github.com/NikhilRaikwar/Speak402"> GitHub</a>
        </div>
      </footer>
    </div>
  );
}

function MobileSectionNav({
  activeSection,
  onChange,
  disabled,
}: {
  activeSection: DashboardSection;
  onChange: (section: DashboardSection) => void;
  disabled: boolean;
}) {
  return (
    <div className="lg:hidden flex gap-2 overflow-x-auto pb-1">
      {sidebarItems.map((item) => {
        const Icon = item.icon;
        const itemDisabled = disabled && item.id !== 'setup';
        return (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={activeSection === item.id ? 'default' : 'outline'}
            disabled={itemDisabled}
            onClick={() => onChange(item.id)}
            className="flex-shrink-0"
          >
            <Icon className="h-3.5 w-3.5 mr-1.5" />
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

function ServiceCatalog({
  selectedServiceId,
  onSelectService,
}: {
  selectedServiceId: string;
  onSelectService: (serviceId: string) => void;
}) {
  return (
    <div className="panel h-full">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            x402 Service Catalog
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {X402_SERVICES.length} services
        </span>
      </div>
      <div className="panel-body space-y-2">
        {X402_SERVICES.map((service) => {
          const active = service.id === selectedServiceId;
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onSelectService(service.id)}
              className={`w-full text-left rounded-md border p-3 transition-colors ${
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:bg-secondary/50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {service.category}
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-1">
                    {service.resource.name}
                  </p>
                </div>
                <span className="text-xs font-bold text-foreground whitespace-nowrap">
                  ${service.resource.price} USDC
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {service.resource.description}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">
                  {service.domain}
                </span>
                {active && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                    <CheckCircle2 className="h-3 w-3" />
                    Selected
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OnboardingPanel({ hasReadyPolicy }: { hasReadyPolicy: boolean }) {
  return (
    <div className="panel h-full">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Winning Demo Path
          </h2>
        </div>
        <span className={hasReadyPolicy ? 'badge-network' : 'badge-mock'}>
          {hasReadyPolicy ? 'Ready' : 'Setup Needed'}
        </span>
      </div>
      <div className="panel-body grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          {
            title: 'Policy first',
            body: 'Judges see the Rust program controls spend before any agent can pay.',
            icon: LockKeyhole,
          },
          {
            title: 'Agent second',
            body: 'The agent can list paid resources, quote, confirm, and execute.',
            icon: Bot,
          },
          {
            title: 'Receipts last',
            body: 'Every purchase ends with a Solana receipt and fulfillment proof.',
            icon: History,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-md bg-secondary/50 p-4">
              <Icon className="h-5 w-5 text-primary mb-3" />
              <p className="text-sm font-semibold text-foreground">
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {item.body}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReceiptExplainer() {
  return (
    <div className="panel h-full">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Receipt Model
          </h2>
        </div>
      </div>
      <div className="panel-body space-y-3">
        <p className="text-sm text-foreground leading-relaxed">
          Speak402 records the authorization and fulfillment state so agents,
          wallets, and merchants can verify what was bought without trusting
          the voice transcript.
        </p>
        <div className="rounded-md bg-secondary/50 p-3">
          <p className="text-xs font-semibold text-foreground">
            Hackathon positioning
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            This is not a chatbot wrapper. The unique Solana primitive is a
            wallet-owned policy account plus receipt account for x402 agent
            payments.
          </p>
        </div>
      </div>
    </div>
  );
}
