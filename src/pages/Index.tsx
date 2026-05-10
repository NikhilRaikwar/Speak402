import React, { useCallback, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CreditCard,
  DatabaseZap,
  FileCheck2,
  History,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Mic,
  Receipt,
  Shield,
  Sparkles,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
    <div className="min-h-screen bg-background flex flex-col">
      <Header mode={mode} />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden lg:flex border-r border-border bg-card flex-col">
          <div className="p-4 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace
            </p>
            <p className="text-sm font-semibold text-foreground mt-1">
              Agent Payment OS
            </p>
          </div>
          <nav className="p-3 space-y-1">
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
                  className={`w-full h-10 px-3 rounded-md flex items-center gap-2 text-sm transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : disabled
                        ? 'text-muted-foreground/50 cursor-not-allowed'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto p-3 border-t border-border">
            <div className="rounded-md bg-secondary/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Hackathon Edge
              </p>
              <p className="text-xs text-foreground mt-1 leading-relaxed">
                Custom Rust policy program + ElevenLabs voice + x402 service
                marketplace.
              </p>
            </div>
          </div>
        </aside>

        <main className="p-3 lg:p-4 space-y-3 max-w-[1280px] mx-auto w-full">
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
            <section className="space-y-3">
              <DemoFlow
                hasPolicy={!!policy && !policy.revoked}
                hasEscrow={escrowBalance.raw > 0}
                mode={mode}
              />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-5">
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
                <div className="lg:col-span-7">
                  <OnboardingPanel hasReadyPolicy={hasReadyPolicy} />
                </div>
              </div>
            </section>
          )}

          {activeSection === 'agent' && (
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:min-h-[620px]">
              <div className="lg:col-span-5">
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
              <div className="lg:col-span-7 grid grid-cols-1 xl:grid-cols-2 gap-3">
                <ServiceCatalog
                  selectedServiceId={selectedServiceId}
                  onSelectService={setSelectedServiceId}
                />
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
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:min-h-[620px]">
              <div className="lg:col-span-7">
                <ServiceCatalog
                  selectedServiceId={selectedServiceId}
                  onSelectService={setSelectedServiceId}
                />
              </div>
              <div className="lg:col-span-5">
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
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:min-h-[620px]">
              <div className="lg:col-span-7">
                <ReceiptsPanel receipts={receipts} />
              </div>
              <div className="lg:col-span-5">
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
  const features = [
    {
      icon: Shield,
      title: 'Policy before payment',
      body: 'The first action is a wallet-owned Solana policy with per-request caps, daily caps, expiry, and merchant scope.',
    },
    {
      icon: Mic,
      title: 'Voice agent with tools',
      body: 'The ElevenLabs agent lists x402 services, reads the quote, asks for confirmation, and only then triggers payment.',
    },
    {
      icon: FileCheck2,
      title: 'Receipts that prove it',
      body: 'Every paid resource ends with a fulfilled receipt, transaction link, and updated remaining allowance.',
    },
  ];

  const process = [
    {
      eyebrow: 'Step 01',
      title: 'Connect wallet',
      body: 'Start with Phantom on Devnet. No account setup, no API key subscription, no agent custody.',
    },
    {
      eyebrow: 'Step 02',
      title: 'Create policy',
      body: 'Deposit Devnet USDC and define the exact budget the agent is allowed to use.',
    },
    {
      eyebrow: 'Step 03',
      title: 'Ask the agent',
      body: 'Say what you need. The agent chooses a paid x402 service and returns a quote.',
    },
    {
      eyebrow: 'Step 04',
      title: 'Sign and unlock',
      body: 'Approve in Phantom, unlock the result, and review the full receipt trail.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8faf9] text-foreground">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50">
              <Shield className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <span className="block text-base font-semibold">Speak402</span>
              <span className="block text-xs text-slate-500">
                Solana x402 voice payments
              </span>
            </div>
          </div>
          <nav className="hidden items-center gap-5 text-sm text-slate-600 md:flex">
            <a href="#policy" className="hover:text-slate-950">
              Policy
            </a>
            <a href="#agent" className="hover:text-slate-950">
              Agent
            </a>
            <a href="#receipts" className="hover:text-slate-950">
              Receipts
            </a>
          </nav>
          <WalletMultiButton />
        </div>
      </header>

      <main>
        <section className="relative border-b border-slate-200 bg-white">
          <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl grid-cols-1 items-center gap-10 px-5 py-12 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-16">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Policy-owned voice payments
                </Badge>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  x402 bonus ready
                </Badge>
              </div>

              <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-slate-950 md:text-6xl lg:text-7xl">
                Give voice agents a wallet they cannot overspend.
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                Speak402 lets users create a Solana spending policy, ask an
                ElevenLabs agent to buy paid x402 resources, approve the real
                Devnet USDC payment in Phantom, and keep a full receipt trail.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <WalletMultiButton />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 border-slate-300 bg-white"
                  onClick={() => {
                    document.getElementById('process')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                >
                  See payment flow
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>

              <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
                {[
                  ['Rust program', 'Policy PDA'],
                  ['Devnet USDC', 'Real signing'],
                  ['ElevenLabs', 'Voice tools'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                    Devnet USDC
                  </span>
                </div>

                <div className="rounded-md bg-white p-4 text-slate-950">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Wallet policy
                      </p>
                      <p className="mt-1 text-2xl font-semibold">4.75 USDC</p>
                    </div>
                    <Shield className="h-8 w-8 text-emerald-600" />
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-md bg-emerald-50 p-3">
                      <p className="text-xs font-semibold uppercase text-emerald-700">
                        Speak402
                      </p>
                      <p className="mt-1 text-sm leading-6">
                        402 quote ready: Mumbai Weather Risk Report from
                        Weather Risk Oracle for 0.25 USDC. Remaining daily
                        allowance is 4.75 USDC. Say yes to authorize.
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-100 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        You
                      </p>
                      <p className="mt-1 text-sm">Yes. Pay it.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">Phantom signs</p>
                        <p className="mt-1 text-sm font-semibold">
                          0.25 USDC
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">Receipt</p>
                        <p className="mt-1 text-sm font-semibold">
                          Fulfilled
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-5 py-5 md:grid-cols-3 lg:px-8">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Colosseum insight
              </p>
              <p className="mt-1 text-sm font-medium text-slate-950">
                x402 gateways are crowded. User safety is the wedge.
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Solana primitive
              </p>
              <p className="mt-1 text-sm font-medium text-slate-950">
                Policy account plus receipt account, enforced on Devnet.
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Demo artifact
              </p>
              <p className="mt-1 text-sm font-medium text-slate-950">
                Quote, signature, unlocked result, receipt, allowance.
              </p>
            </div>
          </div>
        </section>

        <section id="policy" className="bg-white">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <div className="max-w-3xl">
              <Badge variant="outline" className="border-slate-300">
                Product thesis
              </Badge>
              <h2 className="mt-4 text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">
                The agent is useful only because the wallet sets the rules.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Speak402 leads with policy setup so judges immediately see the
                Solana-specific control layer. The chatbot is not the product;
                safe agent spending is the product.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title} className="rounded-lg border-slate-200 shadow-sm">
                    <CardHeader>
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                        <Icon className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-lg tracking-normal">
                        {feature.title}
                      </CardTitle>
                      <CardDescription className="leading-6">
                        {feature.body}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section id="process" className="border-y border-slate-200 bg-slate-950 text-white">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <Badge className="bg-emerald-400 text-slate-950 hover:bg-emerald-400">
                  Policy-first flow
                </Badge>
                <h2 className="mt-4 text-3xl font-semibold leading-tight md:text-4xl">
                  A demo path judges can follow without explanation.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300">
                  Every screen answers one question: who controls the agent,
                  what can it buy, what did it pay, and where is the proof?
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {process.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-white/10 bg-white/[0.04] p-5"
                  >
                    <p className="text-xs font-semibold uppercase text-emerald-300">
                      {item.eyebrow}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="agent" className="bg-white">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div className="max-w-3xl">
                <Badge variant="outline" className="border-slate-300">
                  x402 service catalog
                </Badge>
                <h2 className="mt-4 text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">
                  The agent can choose from paid resources, not one scripted demo.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-600">
                This makes Speak402 feel like an extensible agent payment
                workspace instead of a single hardcoded purchase.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {X402_SERVICES.map((service) => (
                <Card key={service.id} className="rounded-lg border-slate-200">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardDescription className="text-xs font-semibold uppercase">
                          {service.category}
                        </CardDescription>
                        <CardTitle className="mt-2 text-xl tracking-normal">
                          {service.resource.name}
                        </CardTitle>
                      </div>
                      <Badge variant="secondary" className="whitespace-nowrap">
                        {service.resource.price} USDC
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-slate-600">
                      {service.resource.description}
                    </p>
                    <Separator className="my-4" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-500">
                        {service.domain}
                      </span>
                      <span className="font-semibold text-emerald-700">
                        x402-ready
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="receipts" className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <Badge variant="outline" className="border-slate-300">
                  Audit trail
                </Badge>
                <h2 className="mt-4 text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">
                  Receipts turn a voice conversation into verifiable payment history.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-600">
                  The agent cannot merely say "done." The app shows the receipt,
                  fulfillment state, transaction link, and remaining daily
                  allowance after each Solana payment.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DatabaseZap className="h-5 w-5 text-emerald-700" />
                    <h3 className="font-semibold">Receipt vault</h3>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                    Fulfilled
                  </Badge>
                </div>
                <div className="mt-5 grid gap-3">
                  {[
                    ['Merchant', 'Weather Risk Oracle'],
                    ['Resource', 'Mumbai Weather Risk Report'],
                    ['Amount', '0.25 USDC'],
                    ['Receipt', 'Clickable Devnet Explorer address'],
                    ['Transaction', 'Clickable Devnet Explorer signature'],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 rounded-md bg-slate-50 p-3 text-sm"
                    >
                      <span className="text-slate-500">{label}</span>
                      <span className="font-medium text-slate-950">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-12 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                Ready to give the agent a bounded wallet?
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Connect Phantom and the app will take you into policy setup first.
              </p>
            </div>
            <WalletMultiButton />
          </div>
        </section>
      </main>
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
