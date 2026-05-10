import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  Radio,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TranscriptEntry, VoiceSessionStatus } from '@/lib/types';

interface VoiceAgentPanelProps {
  status: VoiceSessionStatus;
  transcript: TranscriptEntry[];
  isSessionActive: boolean;
  isConfigured: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
  onSendMessage: (text: string) => void;
}

export default function VoiceAgentPanel({
  status,
  transcript,
  isSessionActive,
  isConfigured,
  onStartSession,
  onEndSession,
  onSendMessage,
}: VoiceAgentPanelProps) {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const statusLabel: Record<VoiceSessionStatus, string> = {
    idle: 'Not connected',
    connecting: 'Connecting...',
    listening: 'Listening',
    processing: 'Processing',
    speaking: 'Speaking',
    error: 'Error',
  };

  const statusColor: Record<VoiceSessionStatus, string> = {
    idle: 'text-muted-foreground',
    connecting: 'text-warning',
    listening: 'text-success',
    processing: 'text-info',
    speaking: 'text-primary',
    error: 'text-destructive',
  };

  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Voice Agent
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {!isConfigured && (
            <span className="badge-mock">Simulation</span>
          )}
          <span className={`text-xs font-medium ${statusColor[status]}`}>
            <span className="flex items-center gap-1">
              {status === 'listening' && (
                <Radio className="h-3 w-3 animate-pulse" />
              )}
              {statusLabel[status]}
            </span>
          </span>
        </div>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0"
      >
        {transcript.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Mic className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              Start a voice session to interact with the Speak402 agent.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              The agent will help you purchase x402-protected resources.
            </p>
          </div>
        )}

        {transcript.map((entry, i) => (
          <div
            key={i}
            className={`animate-fade-in ${
              entry.role === 'user'
                ? 'transcript-user ml-8'
                : entry.role === 'agent'
                  ? 'transcript-agent mr-8'
                  : 'mx-4'
            }`}
          >
            {entry.role === 'system' ? (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-md p-2">
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{entry.text}</span>
              </div>
            ) : (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {entry.role === 'user' ? 'You' : 'Speak402'}
                </span>
                <p className="text-sm text-foreground mt-0.5 leading-relaxed">
                  {entry.text}
                </p>
                {entry.metadata?.action === 'quote' && (
                  <div className="mt-1.5 bg-warning/5 border border-warning/20 rounded p-2 text-xs">
                    <span className="font-semibold text-warning">
                      402 Quote:
                    </span>{' '}
                    {entry.metadata.resource} - ${entry.metadata.price} USDC
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="border-t border-border p-3 space-y-2">
        {!isSessionActive ? (
          <Button
            onClick={onStartSession}
            disabled={status === 'connecting'}
            className="w-full h-9 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Mic className="h-4 w-4 mr-2" />
            {status === 'connecting' ? 'Connecting...' : 'Start Voice Session'}
          </Button>
        ) : (
          <>
            {/* Text input for simulation mode */}
            <div className="flex gap-2">
              <Input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-8 text-sm flex-1"
                placeholder="Type or speak a command..."
              />
              <Button
                onClick={handleSend}
                size="sm"
                className="h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Send className="h-3 w-3" />
              </Button>
            </div>
            <Button
              onClick={onEndSession}
              variant="outline"
              className="w-full h-7 text-xs text-muted-foreground"
            >
              <MicOff className="h-3 w-3 mr-1" />
              End Session
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
