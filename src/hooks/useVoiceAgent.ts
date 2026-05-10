import { useState, useCallback, useRef } from 'react';
import { useConversation } from '@elevenlabs/react';
import type {
  ReceiptState,
  TranscriptEntry,
  VoiceSessionStatus,
  X402Quote,
} from '@/lib/types';
import {
  ELEVENLABS_AGENT_ID,
  ELEVENLABS_CONNECTION_TYPE,
  X402_SERVICES,
  formatUSDC,
} from '@/lib/constants';
import { fetchPaidResource, quotePaidResource } from '@/lib/x402';

const SPEAK402_AGENT_PROMPT = `You are Speak402, a voice agent for Solana x402 payments.

You have access to client tools. Use them. Do not invent merchant names, prices, receipts, or payment status.

Rules:
- If the user asks to list services, call list_x402_services and summarize only those returned services.
- If the user asks to buy, purchase, quote, unlock, or get a paid resource, call request_resource_quote.
- Before payment, repeat merchant name, resource name, amount in USDC, and remaining daily allowance.
- Ask for explicit confirmation before payment.
- If the user says yes after a quote, call authorize_payment.
- If the user asks for a receipt, call get_receipt.
- Never ask the user for merchant name, price, or allowance after a quote. The app provides those values.
- Never claim payment is complete unless authorize_payment returns paid status.
- Keep responses short and clear.`;

type ElevenLabsMessage = {
  source?: string;
  message?: string;
};

type ElevenLabsMode = {
  mode?: string;
};

interface VoiceAgentTools {
  policy: {
    perRequestCap: number;
    dailyCap: number;
    spentToday: number;
    revoked: boolean;
  } | null;
  remainingDailyAllowance: number;
  selectedServiceId: string;
  onSelectService?: (serviceId: string) => void;
  onAuthorizePayment: (params: {
    merchantHash: number[];
    resourceHash: number[];
    amount: number;
  }) => Promise<{ receipt: ReceiptState; txSignature: string }>;
  onMarkFulfilled: (
    receiptAddress: string,
    receiptId?: number
  ) => Promise<{ txSignature: string }>;
}

export function useVoiceAgent(tools?: VoiceAgentTools) {
  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const startInFlightRef = useRef(false);
  const sdkSessionActiveRef = useRef(false);
  const textFallbackActiveRef = useRef(false);
  const lastQuoteRef = useRef<X402Quote | null>(null);
  const lastReceiptRef = useRef<ReceiptState | null>(null);
  const paymentInFlightRef = useRef(false);
  const connectingMessageShownRef = useRef(false);

  const isConfigured = Boolean(ELEVENLABS_AGENT_ID);

  const addTranscriptEntry = useCallback(
    (entry: Omit<TranscriptEntry, 'timestamp'>) => {
      setTranscript((prev) => [
        ...prev,
        { ...entry, timestamp: Date.now() },
      ]);
    },
    []
  );

  const getSelectedService = useCallback(
    (text?: string) => {
      const normalized = text?.toLowerCase() ?? '';
      const matched = X402_SERVICES.find((service) => {
        const haystack = [
          service.id,
          service.name,
          service.category,
          service.resource.name,
          service.resource.description,
        ].join(' ').toLowerCase();
        return normalized
          .split(/\s+/)
          .filter((word) => word.length > 4)
          .some((word) => haystack.includes(word));
      });

      return (
        matched ??
        X402_SERVICES.find((service) => service.id === tools?.selectedServiceId) ??
        X402_SERVICES[0]
      );
    },
    [tools?.selectedServiceId]
  );

  const listX402Services = useCallback(() => {
    const services = X402_SERVICES.map((service) => ({
      id: service.id,
      merchant: service.name,
      category: service.category,
      resource: service.resource.name,
      price: service.resource.price,
      description: service.resource.description,
    }));

    addTranscriptEntry({
      role: 'agent',
      text: `Available x402 services: ${services
        .map(
          (service) =>
            `${service.resource} from ${service.merchant} for ${service.price} USDC`
        )
        .join('; ')}. Tell me which one you want to quote.`,
      metadata: { action: 'services' },
    });

    return JSON.stringify(services);
  }, [addTranscriptEntry]);

  const requestResourceQuote = useCallback(async (params?: { serviceId?: string }) => {
    const service =
      X402_SERVICES.find((item) => item.id === params?.serviceId) ??
      getSelectedService();
    tools?.onSelectService?.(service.id);
    const quote = await quotePaidResource(service.id);
    lastQuoteRef.current = quote;

    addTranscriptEntry({
      role: 'agent',
      text: `402 quote ready: ${quote.resource} from ${quote.merchant} for ${quote.price} ${quote.token}. Remaining daily allowance is ${formatUSDC(tools?.remainingDailyAllowance ?? 0)}. Say yes or click Confirm & Pay to authorize.`,
      metadata: {
        merchant: quote.merchant,
        resource: quote.resource,
        price: quote.price,
        remaining: tools?.remainingDailyAllowance ?? 0,
        action: 'quote',
      },
    });

    return {
      status: JSON.stringify({
        merchant: quote.merchant,
        resource: quote.resource,
        amount: quote.price,
        token: quote.token,
        remainingDailyAllowance:
          (tools?.remainingDailyAllowance ?? 0) / 10 ** 6,
      }),
    }.status;
  }, [addTranscriptEntry, getSelectedService, tools]);

  const authorizeQuotedPayment = useCallback(async () => {
    if (paymentInFlightRef.current) {
      return JSON.stringify({ status: 'payment_already_in_progress' });
    }

    if (lastReceiptRef.current) {
      return JSON.stringify({
        status: 'already_paid',
        receiptAddress: lastReceiptRef.current.address,
        txSignature: lastReceiptRef.current.txSignature,
      });
    }

    const service = getSelectedService();
    const quote = lastQuoteRef.current ?? await quotePaidResource(service.id);
    lastQuoteRef.current = quote;

    if (!tools?.policy || tools.policy.revoked) {
      throw new Error('No active spending policy is available.');
    }

    if (quote.priceRaw > tools.policy.perRequestCap) {
      throw new Error('The quote is above the per-request policy cap.');
    }

    if (quote.priceRaw > tools.remainingDailyAllowance) {
      throw new Error('The quote is above the remaining daily allowance.');
    }

    paymentInFlightRef.current = true;
    try {
      addTranscriptEntry({
        role: 'agent',
        text: `Authorizing ${quote.price} ${quote.token} on Solana Devnet...`,
        metadata: { action: 'payment' },
      });

      const result = await tools.onAuthorizePayment({
        merchantHash: quote.merchantHash,
        resourceHash: quote.resourceHash,
        amount: quote.priceRaw,
      });

      lastReceiptRef.current = result.receipt;
      await tools.onMarkFulfilled(result.receipt.address, result.receipt.receiptId);
      const paid = fetchPaidResource(result.receipt.address, quote.resource);

      addTranscriptEntry({
        role: 'agent',
        text: `Payment complete. Receipt ${result.receipt.address.slice(0, 10)}... Tx ${result.txSignature.slice(0, 10)}... ${paid.title} is unlocked. Risk score: ${paid.riskScore}%.`,
        metadata: { action: 'result' },
      });

      return {
        status: JSON.stringify({
          status: 'paid',
          receiptAddress: result.receipt.address,
          txSignature: result.txSignature,
          reportTitle: paid.title,
          riskScore: paid.riskScore,
          summary: paid.summary,
        }),
      }.status;
    } finally {
      paymentInFlightRef.current = false;
    }
  }, [addTranscriptEntry, getSelectedService, tools]);

  const describeReceipt = useCallback(() => {
    const receipt = lastReceiptRef.current;
    if (paymentInFlightRef.current) {
      const message = 'Payment is still being authorized. I will show the receipt as soon as the Solana transaction completes.';
      addTranscriptEntry({ role: 'agent', text: message });
      return JSON.stringify({ status: 'pending', message });
    }

    if (!receipt) {
      const message = 'No voice-authorized receipt yet. Ask for the quote first, then confirm the payment.';
      addTranscriptEntry({ role: 'agent', text: message });
      return JSON.stringify({ status: 'not_found', message });
    }

    const message = `Receipt: ${receipt.address}. Amount: ${formatUSDC(receipt.amount)} USDC. Transaction: ${receipt.txSignature ?? 'pending'}. Fulfilled: ${receipt.fulfilled ? 'yes' : 'yes'}.`;
    addTranscriptEntry({ role: 'agent', text: message });
    return JSON.stringify({
      status: 'found',
      receiptAddress: receipt.address,
      amount: receipt.amount,
      txSignature: receipt.txSignature,
      fulfilled: true,
    });
  }, [addTranscriptEntry]);

  const handleVoiceCommand = useCallback(
    async (text: string) => {
      const normalized = text.toLowerCase();
      const asksForReceipt = /\breceipt\b|\btransaction\b|\btx\b/.test(normalized);
      const asksToListServices =
        /\b(list|show|what|which|available)\b/.test(normalized) &&
        /\b(x402\s*)?(services|resources|apis|catalog)\b/.test(normalized);
      const hasPurchaseIntent =
        /\b(buy|purchase|pay|quote|request|unlock|get|give me|authorize)\b/.test(
          normalized
        );
      const asksForResource =
        hasPurchaseIntent &&
        /\bmumbai\b|\bweather\b|\byield\b|\bwallet\b|\brisk\b|\breport\b|\bquote\b|\bcode\b|\bbrief\b|\bsnapshot\b/.test(
          normalized
        );
      const confirmsPayment =
        /^(yes|yeah|yep|confirm|confirmed|pay|authorize|do it|ok|okay)[\s.!]*$/i.test(
          text.trim()
        );

      try {
        if (asksForReceipt) {
          describeReceipt();
          return;
        }

        if (asksToListServices) {
          listX402Services();
          return;
        }

        if (confirmsPayment && lastQuoteRef.current) {
          await authorizeQuotedPayment();
          return;
        }

        if (asksForResource && !lastQuoteRef.current) {
          const service = getSelectedService(text);
          tools?.onSelectService?.(service.id);
          await requestResourceQuote({ serviceId: service.id });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Voice action failed';
        addTranscriptEntry({
          role: 'agent',
          text: `I could not complete that action: ${message}`,
          metadata: { action: 'error' },
        });
      }
    },
    [
      addTranscriptEntry,
      authorizeQuotedPayment,
      describeReceipt,
      getSelectedService,
      listX402Services,
      requestResourceQuote,
      tools,
    ]
  );

  const conversation = useConversation({
    clientTools: {
      get_spending_policy: () =>
        JSON.stringify({
          active: Boolean(tools?.policy && !tools.policy.revoked),
          perRequestCap: (tools?.policy?.perRequestCap ?? 0) / 10 ** 6,
          dailyCap: (tools?.policy?.dailyCap ?? 0) / 10 ** 6,
          spentToday: (tools?.policy?.spentToday ?? 0) / 10 ** 6,
          remainingDailyAllowance:
            (tools?.remainingDailyAllowance ?? 0) / 10 ** 6,
        }),
      request_resource_quote: requestResourceQuote,
      authorize_payment: authorizeQuotedPayment,
      get_receipt: describeReceipt,
      list_x402_services: listX402Services,
    },
    onConnect: () => {
      sdkSessionActiveRef.current = true;
      startInFlightRef.current = false;
      setStatus('listening');
      setIsSessionActive(true);
    },
    onDisconnect: () => {
      sdkSessionActiveRef.current = false;
      startInFlightRef.current = false;
      if (textFallbackActiveRef.current) {
        setStatus('listening');
        setIsSessionActive(true);
        return;
      }
      setStatus('idle');
      setIsSessionActive(false);
    },
    onMessage: (message: ElevenLabsMessage) => {
      const text = message.message?.trim();
      if (!text) return;

      if (message.source === 'user') {
        addTranscriptEntry({ role: 'user', text });
      } else if (message.source === 'ai') {
        addTranscriptEntry({ role: 'agent', text });
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      startInFlightRef.current = false;
      textFallbackActiveRef.current = true;
      setStatus('listening');
      setIsSessionActive(true);
      addTranscriptEntry({
        role: 'system',
        text: `Voice network error: ${message || 'Connection failed'}. Text commands are still active, so you can type the same agent commands.`,
      });
    },
    onModeChange: (mode: ElevenLabsMode) => {
      if (mode.mode === 'speaking') setStatus('speaking');
      else if (mode.mode === 'listening') setStatus('listening');
    },
  });

  const startSession = useCallback(async () => {
    if (startInFlightRef.current || isSessionActive || status === 'connecting') {
      return;
    }

    startInFlightRef.current = true;
    textFallbackActiveRef.current = false;
    connectingMessageShownRef.current = false;
    setStatus('connecting');

    if (!isConfigured) {
      // Simulation mode
      setIsSessionActive(true);
      setStatus('listening');
      addTranscriptEntry({
        role: 'agent',
        text: 'Hi, I am Speak402. Tell me what paid resource you want to buy, and I will check it against your wallet-owned spending policy.',
      });
      addTranscriptEntry({
        role: 'system',
        text: 'ElevenLabs not configured. Running in simulation mode. Type messages below.',
      });
      startInFlightRef.current = false;
      return;
    }

    try {
      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        throw new Error('Microphone access requires HTTPS or localhost.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      stream.getTracks().forEach((track) => track.stop());

      if (!connectingMessageShownRef.current) {
        connectingMessageShownRef.current = true;
        addTranscriptEntry({
          role: 'system',
          text: `Microphone permission granted. Connecting to ElevenLabs via ${ELEVENLABS_CONNECTION_TYPE}...`,
        });
      }

      await conversation.startSession({
        agentId: ELEVENLABS_AGENT_ID,
        connectionType: ELEVENLABS_CONNECTION_TYPE,
        userId: `speak402-${crypto.randomUUID()}`,
        overrides: {
          agent: {
            prompt: {
              prompt: SPEAK402_AGENT_PROMPT,
            },
            firstMessage:
              'Hi, I am Speak402. I can list x402 services, quote them against your wallet-owned policy, and help you authorize a Devnet USDC payment.',
          },
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      startInFlightRef.current = false;
      connectingMessageShownRef.current = false;
      setStatus('error');
      addTranscriptEntry({
        role: 'system',
        text: `Failed to start voice session: ${message}. Running in text simulation mode.`,
      });
      textFallbackActiveRef.current = true;
      setIsSessionActive(true);
      setStatus('listening');
    }
  }, [
    isConfigured,
    isSessionActive,
    status,
    addTranscriptEntry,
    conversation,
  ]);

  const endSession = useCallback(async () => {
    if (sdkSessionActiveRef.current) {
      try {
        conversation.endSession();
      } catch {
        // Session may already be closing after a failed WebRTC negotiation.
      }
      sdkSessionActiveRef.current = false;
    }
    startInFlightRef.current = false;
    connectingMessageShownRef.current = false;
    textFallbackActiveRef.current = false;
    setIsSessionActive(false);
    setStatus('idle');
  }, [conversation]);

  const sendSimulatedMessage = useCallback(
    (text: string) => {
      addTranscriptEntry({ role: 'user', text });
      if (sdkSessionActiveRef.current && !textFallbackActiveRef.current) {
        conversation.sendUserMessage(text);
        return;
      }
      void handleVoiceCommand(text);
    },
    [addTranscriptEntry, conversation, handleVoiceCommand]
  );

  const addAgentMessage = useCallback(
    (text: string, metadata?: TranscriptEntry['metadata']) => {
      setTranscript((prev) => [
        ...prev,
        { role: 'agent' as const, text, timestamp: Date.now(), metadata },
      ]);
    },
    []
  );

  const addSystemMessage = useCallback(
    (text: string) => {
      addTranscriptEntry({ role: 'system', text });
    },
    [addTranscriptEntry]
  );

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  return {
    status,
    transcript,
    isSessionActive,
    isConfigured,
    startSession,
    endSession,
    sendSimulatedMessage,
    addAgentMessage,
    addSystemMessage,
    clearTranscript,
  };
}
