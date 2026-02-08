import { useStore, useValue } from "nucleux";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ContextSources } from "@/components/ContextSources";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInput } from "@/components/VoiceInput";
import { cn } from "@/lib/utils";
import PiperService from "@/services/piper";
import WakeWordService, { type WakeWordDetection } from "@/services/wake-word";
import ChatHistoryStore from "@/stores/ChatHistoryStore";
import ChatStore from "@/stores/ChatStore";
import SettingsStore from "@/stores/SettingsStore";

const safeMessageContent = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (content === null || content === undefined) {
    return "";
  }
  return String(content);
};

export const Chat: React.FC = () => {
  const piperService = useStore(PiperService);
  const wakeWordService = useStore(WakeWordService);
  const chatHistoryStore = useStore(ChatHistoryStore);
  const settingsStore = useStore(SettingsStore);
  const chatStore = useStore(ChatStore);

  const messages = useValue(chatHistoryStore.messages);
  const isLoading = useValue(chatStore.isLoading);
  const isStreaming = useValue(chatStore.isStreaming);
  const streamingMessage = useValue(chatStore.streamingMessage);
  const ttsVoice = useValue(settingsStore.ttsVoice);
  const wakeWordEnabled = useValue(settingsStore.wakeWordEnabled);
  const wakeWordPhrase = useValue(settingsStore.wakeWordPhrase);
  const isSpeaking = useValue(piperService.isSpeaking);
  const isWakeWordListening = useValue(wakeWordService.isListening);
  const lastContextUsed = useValue(chatStore.lastContextUsed);
  const contextRetrievalTime = useValue(chatStore.contextRetrievalTime);

  const [input, setInput] = useState("");
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  const handleWakeWordDetection = (detection: WakeWordDetection) => {
    console.log("Wake word detected:", detection);
    setWakeWordDetected(true);

    setTimeout(() => {
      setWakeWordDetected(false);
    }, 2000);

    setIsVoiceInputActive(true);
  };

  useEffect(() => {
    if (wakeWordEnabled && !isVoiceInputActive) {
      wakeWordService.startDetection(handleWakeWordDetection);
    } else if (!wakeWordEnabled && isWakeWordListening) {
      wakeWordService.stopDetection();
    }

    return () => {
      if (isWakeWordListening) {
        wakeWordService.stopDetection();
      }
    };
  }, [
    wakeWordService,
    isWakeWordListening,
    wakeWordEnabled,
    isVoiceInputActive,
  ]);

  const handleSend = async () => {
    if (!input.trim()) return;
    setInput("");
    await chatStore.sendMessage(input);
  };

  const handleVoiceTranscript = async (transcript: string) => {
    if (!transcript.trim()) return;
    await chatStore.sendMessage(transcript);
    setIsVoiceInputActive(false);
  };

  const handleManualSpeak = async (text: string) => {
    if (isSpeaking) {
      piperService.stop();
    } else {
      await piperService.speak({ text, voice: ttsVoice });
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-hidden p-5">
      <div className="flex-1 overflow-hidden rounded-lg border bg-card">
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                id={`message-${msg.id}`}
                className={cn(
                  "rounded-lg p-4",
                  msg.role === "user" ? "bg-primary/10" : "bg-muted"
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">
                    {msg.role === "user" ? "You" : "Zion"}
                  </span>
                  {msg.role === "assistant" && (
                    <Button
                      onClick={() =>
                        handleManualSpeak(safeMessageContent(msg.content))
                      }
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title={
                        isSpeaking ? "Stop speaking" : "Speak this message"
                      }
                    >
                      {isSpeaking ? "🔇" : "🔊"}
                    </Button>
                  )}
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {safeMessageContent(msg.content)}
                  </ReactMarkdown>
                </div>

                {msg.role === "assistant" &&
                  idx === messages.length - 1 &&
                  lastContextUsed.length > 0 && (
                    <ContextSources
                      sources={lastContextUsed}
                      className="mt-3"
                    />
                  )}
              </div>
            ))}

            {isStreaming && streamingMessage && (
              <div className="rounded-lg bg-muted p-4">
                <div className="mb-2 font-semibold">Zion</div>
                <div className="prose prose-sm dark:prose-invert inline max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {safeMessageContent(streamingMessage)}
                  </ReactMarkdown>
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary" />
                </div>

                {lastContextUsed.length > 0 && (
                  <div className="mt-3">
                    <ContextSources sources={lastContextUsed} />
                    {contextRetrievalTime > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Context retrieved in {contextRetrievalTime}ms
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {isLoading && (
              <div className="rounded-lg bg-muted p-4 italic text-muted-foreground">
                Thinking...
              </div>
            )}

            {isSpeaking && (
              <div className="rounded-lg bg-primary/10 p-4 italic text-primary">
                🔊 Speaking...
              </div>
            )}

            {wakeWordDetected && (
              <div className="rounded-lg bg-green-500/10 p-4 italic text-green-600 dark:text-green-400">
                👂 Wake word detected! Listening...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      <div>
        {wakeWordEnabled && isWakeWordListening && !isVoiceInputActive && (
          <div className="mb-4 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              👂 Listening for wake word: <strong>"{wakeWordPhrase}"</strong>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Say the wake word to activate voice input
            </p>
          </div>
        )}

        <VoiceInput
          onTranscript={handleVoiceTranscript}
          onListening={setIsVoiceInputActive}
          autoActivate={wakeWordDetected}
        />
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {wakeWordEnabled
            ? `Say "${wakeWordPhrase}" or click microphone`
            : "Click microphone and speak your message"}
        </p>
      </div>

      <Separator />

      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Or type your message..."
          className="flex-1"
          rows={1}
          disabled={isLoading || isStreaming}
        />
        <Button
          onClick={handleSend}
          disabled={isLoading || isStreaming || !input.trim()}
        >
          Send
        </Button>
      </div>
    </div>
  );
};
