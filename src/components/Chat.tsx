import { useStore, useValue } from "nucleux";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import HomeAssistantService from "@/services/home-assistant";
import IntentClassifierService from "@/services/intent-classifier";
import OllamaService, { type Message } from "@/services/ollama";
import PiperService from "@/services/piper";
import WakeWordService, { type WakeWordDetection } from "@/services/wake-word";
import ChatHistoryStore from "@/stores/ChatHistoryStore";
import ModelStore from "@/stores/ModelStore";
import SettingsStore from "@/stores/SettingsStore";

import { VoiceInput } from "./VoiceInput";

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
  const intentClassifierService = useStore(IntentClassifierService);
  const ollamaService = useStore(OllamaService);
  const homeAssistantService = useStore(HomeAssistantService);
  const piperService = useStore(PiperService);
  const wakeWordService = useStore(WakeWordService);

  const chatHistoryStore = useStore(ChatHistoryStore);
  const settingsStore = useStore(SettingsStore);

  const activeModel = useValue(ModelStore, "activeModel");
  const messages = useValue(chatHistoryStore.messages);
  const ttsVoice = useValue(settingsStore.ttsVoice);
  const autoPlayTTS = useValue(settingsStore.autoPlayTTS);
  const isSpeaking = useValue(piperService.isSpeaking);
  const wakeWordEnabled = useValue(settingsStore.wakeWordEnabled);
  const wakeWordPhrase = useValue(settingsStore.wakeWordPhrase);
  const isWakeWordListening = useValue(wakeWordService.isListening);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  const handleWakeWordDetection = (detection: WakeWordDetection) => {
    console.log("Wake word detected:", detection);
    setWakeWordDetected(true);

    // Brief visual feedback
    setTimeout(() => {
      setWakeWordDetected(false);
    }, 2000);

    // Automatically trigger voice input
    setIsVoiceInputActive(true);
  };

  // Handle wake word detection on/off
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

  const speakResponse = async (text: string) => {
    if (!autoPlayTTS) return;
    await piperService.speak({ text, voice: ttsVoice });
  };

  const processCommand = async (command: string) => {
    const userMessage: Message = { role: "user", content: command };

    chatHistoryStore.addMessage(userMessage);

    setLoading(true);

    try {
      const intentType = await intentClassifierService.classifyIntent(command);

      if (intentType === "HOME_CONTROL") {
        const result = await homeAssistantService.processConversation(command);
        const assistantMessage: Message = {
          role: "assistant",
          content: result,
        };

        chatHistoryStore.addMessage(assistantMessage);
        setLoading(false);
        await speakResponse(result);
      } else {
        setIsStreaming(true);
        setStreamingMessage("");
        setLoading(false);

        let fullResponse = "";

        await ollamaService.chatStream(
          activeModel,
          [...messages, userMessage],
          (chunk) => {
            fullResponse += chunk;
            setStreamingMessage(fullResponse);
          }
        );

        const assistantMessage: Message = {
          role: "assistant",
          content: fullResponse,
        };

        chatHistoryStore.addMessage(assistantMessage);
        setStreamingMessage("");
        setIsStreaming(false);
        await speakResponse(fullResponse);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, something went wrong.",
      };

      chatHistoryStore.addMessage(errorMessage);
      setLoading(false);
      setIsStreaming(false);
      setStreamingMessage("");
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    setInput("");
    await processCommand(input);
  };

  const handleVoiceTranscript = async (transcript: string) => {
    if (!transcript.trim()) return;
    await processCommand(transcript);
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
                key={idx}
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
              </div>
            )}

            {loading && (
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
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyUp={(e) => e.key === "Enter" && handleSend()}
          placeholder="Or type your message..."
          className="flex-1"
          disabled={loading || isStreaming}
        />
        <Button
          onClick={handleSend}
          disabled={loading || isStreaming || !input.trim()}
        >
          Send
        </Button>
      </div>
    </div>
  );
};
