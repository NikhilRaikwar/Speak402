import { useState, useCallback, useRef } from 'react';
import { Conversation } from '@elevenlabs/client';
import type { Conversation as ElevenLabsConversation } from '@elevenlabs/client';
import type {
  ReceiptState,
  TranscriptEntry,
  VoiceSessionStatus,
  X402Quote,
} from '@/lib/types';
import {
  ELEVENLABS_AGENT_ID,
  X402_SERVICES,
} from '@/lib/constants';
import { fetchPaidResource, quotePaidResource } from '@/lib/x402';

const DIRECT_ELEVENLABS_CONNECTION_TYPE = 'websocket' as const;
const ENABLE_BROWSER_FALLBACK_TTS = false;

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{
      isFinal: boolean;
      0: { transcript: string };
    }>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

declare global {
  interface WebSocket {
    __speak402SafeSendPatched?: boolean;
  }

  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

function installSafeWebSocketSendGuard() {
  const proto = WebSocket.prototype;
  if (proto.__speak402SafeSendPatched) return;

  const nativeSend = proto.send;
  proto.send = function safeSpeak402Send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (this.readyState !== WebSocket.OPEN) {
      return;
    }

    return nativeSend.call(this, data);
  };
  proto.__speak402SafeSendPatched = true;
}

type ElevenLabsMessage = {
  source?: string;
  message?: string;
};

type ElevenLabsMode = {
  mode?: string;
};

type ElevenLabsStatus = {
  status?: 'disconnected' | 'connecting' | 'connected' | 'error';
};

let activeVoiceConversation: ElevenLabsConversation | null = null;
let activeVoiceStartPromise: Promise<ElevenLabsConversation> | null = null;

function shortHash(value?: string, chars = 8) {
  if (!value) return undefined;
  return `${value.slice(0, chars)}...${value.slice(-chars)}`;
}

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
  const conversationRef = useRef<ElevenLabsConversation | null>(null);
  const lastQuoteRef = useRef<X402Quote | null>(null);
  const lastReceiptRef = useRef<ReceiptState | null>(null);
  const paymentInFlightRef = useRef(false);
  const receiptRequestInFlightRef = useRef<Promise<void> | null>(null);
  const elevenLabsSessionActiveRef = useRef(false);
  const connectingMessageShownRef = useRef(false);
  const browserVoiceActiveRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const browserGreetingShownRef = useRef(false);
  const lastUserTranscriptRef = useRef<{ text: string; timestamp: number } | null>(
    null
  );

  const isConfigured = Boolean(ELEVENLABS_AGENT_ID);

  const speakText = useCallback((text: string) => {
    if (!ENABLE_BROWSER_FALLBACK_TTS) return;
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const addTranscriptEntry = useCallback(
    (entry: Omit<TranscriptEntry, 'timestamp'>) => {
      setTranscript((prev) => [
        ...prev,
        { ...entry, timestamp: Date.now() },
      ]);

      if (entry.role === 'agent') {
        speakText(entry.text);
      }
    },
    [speakText]
  );

  const addSystemEntryOnce = useCallback(
    (text: string) => {
      setTranscript((prev) => {
        if (prev.some((entry) => entry.role === 'system' && entry.text === text)) {
          return prev;
        }

        return [
          ...prev,
          { role: 'system' as const, text, timestamp: Date.now() },
        ];
      });
    },
    []
  );

  const addUserTranscriptOnce = useCallback(
    (text: string) => {
      const normalized = text.trim().toLowerCase();
      const previous = lastUserTranscriptRef.current;
      const now = Date.now();
      if (
        previous?.text === normalized &&
        now - previous.timestamp < 2500
      ) {
        return false;
      }

      lastUserTranscriptRef.current = { text: normalized, timestamp: now };
      addTranscriptEntry({ role: 'user', text });
      return true;
    },
    [addTranscriptEntry]
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
  }, [getSelectedService, tools]);

  const authorizeQuotedPayment = useCallback(async () => {
    if (paymentInFlightRef.current) {
      return JSON.stringify({ status: 'payment_already_in_progress' });
    }

    if (lastReceiptRef.current) {
      return JSON.stringify({
        status: 'already_paid',
        receipt: shortHash(lastReceiptRef.current.address),
        transaction: shortHash(lastReceiptRef.current.txSignature),
        voiceInstruction:
          'Say the payment is already complete. Do not read full receipt addresses or transaction signatures aloud.',
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

    const runPayment = async () => {
      paymentInFlightRef.current = true;
      try {
        addTranscriptEntry({
          role: 'agent',
          text: `Wallet confirmation opened for ${quote.price} ${quote.token}. Approve it in Phantom to complete the purchase.`,
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

        if (conversationRef.current?.isOpen()) {
          conversationRef.current.sendContextualUpdate(
            'Payment status update: the Phantom transaction is complete. The paid resource is unlocked. If the user says yes, done, approved, or asks about status, do not ask whether they approved Phantom again. Say the payment is complete and the receipt and transaction links are visible in the app.'
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Payment failed';
        addTranscriptEntry({
          role: 'agent',
          text: `Payment did not complete: ${message}`,
          metadata: { action: 'error' },
        });
      } finally {
        paymentInFlightRef.current = false;
        receiptRequestInFlightRef.current = null;
      }
    };

    const paymentPromise = runPayment();
    receiptRequestInFlightRef.current = paymentPromise;
    if (elevenLabsSessionActiveRef.current) {
      void paymentPromise;
      return JSON.stringify({
        status: 'wallet_confirmation_required',
        message:
          'Ask the user to approve the Phantom wallet popup. Do not say payment failed or complete until get_receipt returns a receipt.',
      });
    }

    await paymentPromise;
    const receipt = lastReceiptRef.current;
    return JSON.stringify({
      status: receipt ? 'paid' : 'pending',
      receipt: shortHash(receipt?.address),
      transaction: shortHash(receipt?.txSignature),
      voiceInstruction:
        'If paid, say the payment is complete and the receipt is visible in the app. Do not read full receipt addresses or transaction signatures aloud.',
    });
  }, [addTranscriptEntry, getSelectedService, tools]);

  const describeReceipt = useCallback(() => {
    const receipt = lastReceiptRef.current;
    if (paymentInFlightRef.current) {
      return JSON.stringify({
        status: 'pending',
        message:
          'Payment is still waiting for Phantom wallet confirmation or Solana finalization.',
      });
    }

    if (!receipt) {
      return JSON.stringify({
        status: 'not_found',
        message: 'No completed voice-authorized receipt yet.',
      });
    }

    return JSON.stringify({
      status: 'found',
      paymentComplete: true,
      message:
        'Payment is complete. The receipt and transaction links are visible in the app.',
      voiceInstruction:
        'Do not read the full receipt address or transaction signature aloud. Only say that links are visible in the app.',
      receipt: shortHash(receipt.address),
      amount: receipt.amount,
      transaction: shortHash(receipt.txSignature),
      fulfilled: true,
    });
  }, []);

  const handleVoiceCommand = useCallback(
    async (text: string) => {
      const normalized = text.toLowerCase();
      const asksForReceipt = /\breceipt\b|\btransaction\b|\btx\b/.test(normalized);
      const asksToListServices =
        /^(list|show|what|which|available)$/i.test(text.trim()) ||
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
      const isGreeting =
        /^(hi|hello|hey|yo|namaste|hii|hiii|hey hello)[\s.!]*$/i.test(
          text.trim()
        );

      try {
        if (isGreeting) {
          addTranscriptEntry({
            role: 'agent',
            text: 'Hi, I am Speak402. I can list x402 services, quote a paid resource, and help you authorize a Solana Devnet USDC payment after you confirm.',
          });
          return;
        }

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

        if (asksForResource) {
          const service = getSelectedService(text);
          tools?.onSelectService?.(service.id);
          await requestResourceQuote({ serviceId: service.id });
          return;
        }

        addTranscriptEntry({
          role: 'agent',
          text: 'I can help with three commands: say “list x402 services”, “buy the Mumbai weather risk report”, or “get my receipt”.',
        });
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

  const stopBrowserVoice = useCallback(() => {
    browserVoiceActiveRef.current = false;
    window.speechSynthesis?.cancel();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
    }
  }, []);

  const startBrowserVoice = useCallback(() => {
    browserVoiceActiveRef.current = true;

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      addSystemEntryOnce(
        'Browser speech recognition is not available here. Text commands and spoken replies are still active.'
      );
      return;
    }

    if (recognitionRef.current) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result?.isFinal) continue;
        const text = result[0]?.transcript?.trim();
        if (!text) continue;
        if (addUserTranscriptOnce(text)) {
          void handleVoiceCommand(text);
        }
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      addSystemEntryOnce(
        `Browser microphone listener paused${event.error ? `: ${event.error}` : ''}. You can still type commands.`
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (!browserVoiceActiveRef.current) return;
      window.setTimeout(() => {
        if (!browserVoiceActiveRef.current || recognitionRef.current) return;
        startBrowserVoice();
      }, 300);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      addSystemEntryOnce('Browser microphone listener is active.');
      if (!browserGreetingShownRef.current) {
        browserGreetingShownRef.current = true;
        addTranscriptEntry({
          role: 'agent',
          text: 'Hi, I am Speak402. Tell me what paid resource you want to buy, or say list x402 services.',
        });
      }
    } catch {
      recognitionRef.current = null;
    }
  }, [
    addSystemEntryOnce,
    addTranscriptEntry,
    addUserTranscriptOnce,
    handleVoiceCommand,
  ]);

  const startSession = useCallback(async () => {
    const existingConversation = conversationRef.current ?? activeVoiceConversation;
    if (
      startInFlightRef.current ||
      activeVoiceStartPromise ||
      existingConversation?.isOpen() ||
      isSessionActive ||
      status === 'connecting'
    ) {
      if (existingConversation?.isOpen()) {
        conversationRef.current = existingConversation;
        sdkSessionActiveRef.current = true;
        setStatus('listening');
        setIsSessionActive(true);
      }
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
      startBrowserVoice();
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
      installSafeWebSocketSendGuard();

      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        throw new Error('Microphone access requires HTTPS or localhost.');
      }

      if (!connectingMessageShownRef.current) {
        connectingMessageShownRef.current = true;
        addSystemEntryOnce(
          'Requesting microphone access and connecting to ElevenLabs voice WebSocket...'
        );
      }

      activeVoiceStartPromise = Conversation.startSession({
        agentId: ELEVENLABS_AGENT_ID,
        connectionType: DIRECT_ELEVENLABS_CONNECTION_TYPE,
        userId: `speak402-${crypto.randomUUID()}`,
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
          elevenLabsSessionActiveRef.current = true;
          startInFlightRef.current = false;
          setStatus('listening');
          setIsSessionActive(true);
          addSystemEntryOnce(
            'ElevenLabs voice agent connected. Speak now; custom ElevenLabs voice is active.'
          );
        },
        onDisconnect: () => {
          conversationRef.current = null;
          activeVoiceConversation = null;
          activeVoiceStartPromise = null;
          sdkSessionActiveRef.current = false;
          elevenLabsSessionActiveRef.current = false;
          startInFlightRef.current = false;
          if (textFallbackActiveRef.current) {
            setStatus('listening');
            setIsSessionActive(true);
            return;
          }
          setStatus('idle');
          setIsSessionActive(false);
          addSystemEntryOnce(
            'ElevenLabs realtime audio closed. Start a new session after checking the published agent voice/tool configuration.'
          );
        },
        onMessage: (message: ElevenLabsMessage) => {
          const text = message.message?.trim();
          if (!text) return;

          if (message.source === 'user') {
            if (addUserTranscriptOnce(text) && !elevenLabsSessionActiveRef.current) {
              void handleVoiceCommand(text);
            }
          } else if (message.source === 'ai') {
            addTranscriptEntry({ role: 'agent', text });
          }
        },
        onError: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          conversationRef.current = null;
          sdkSessionActiveRef.current = false;
          elevenLabsSessionActiveRef.current = false;
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
        onStatusChange: (event: ElevenLabsStatus) => {
          if (event.status === 'connected') {
            sdkSessionActiveRef.current = true;
            elevenLabsSessionActiveRef.current = true;
            return;
          }

          if (event.status === 'disconnected' || event.status === 'error') {
            sdkSessionActiveRef.current = false;
            elevenLabsSessionActiveRef.current = false;
          }
        },
      });

      const conversation = await activeVoiceStartPromise;
      activeVoiceConversation = conversation;
      activeVoiceStartPromise = null;
      conversationRef.current = conversation;
      sdkSessionActiveRef.current = true;
      elevenLabsSessionActiveRef.current = true;
      startInFlightRef.current = false;
      setStatus('listening');
      setIsSessionActive(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      activeVoiceConversation = null;
      activeVoiceStartPromise = null;
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
    addSystemEntryOnce,
    handleVoiceCommand,
    addUserTranscriptOnce,
    tools,
    requestResourceQuote,
    authorizeQuotedPayment,
    describeReceipt,
    listX402Services,
    startBrowserVoice,
  ]);

  const endSession = useCallback(async () => {
    stopBrowserVoice();
    const conversation = conversationRef.current ?? activeVoiceConversation;
    conversationRef.current = null;
    activeVoiceConversation = null;
    activeVoiceStartPromise = null;
    sdkSessionActiveRef.current = false;
    elevenLabsSessionActiveRef.current = false;
    if (conversation) {
      try {
        await conversation.endSession();
      } catch {
        // Session may already be closing after a failed WebRTC negotiation.
      }
    }
    startInFlightRef.current = false;
    connectingMessageShownRef.current = false;
    textFallbackActiveRef.current = false;
    browserGreetingShownRef.current = false;
    lastUserTranscriptRef.current = null;
    setIsSessionActive(false);
    setStatus('idle');
  }, [stopBrowserVoice]);

  const sendSimulatedMessage = useCallback(
    (text: string) => {
      addTranscriptEntry({ role: 'user', text });

      const canSendToSdk =
        sdkSessionActiveRef.current &&
        !textFallbackActiveRef.current &&
        conversationRef.current?.isOpen();

      if (canSendToSdk) {
        try {
          conversationRef.current?.sendUserMessage(text);
          return;
        } catch {
          sdkSessionActiveRef.current = false;
          elevenLabsSessionActiveRef.current = false;
          textFallbackActiveRef.current = true;
          addTranscriptEntry({
            role: 'system',
            text: 'ElevenLabs session is closing. Using local text commands for this message.',
          });
        }
      }

      void handleVoiceCommand(text);
    },
    [addTranscriptEntry, handleVoiceCommand]
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
