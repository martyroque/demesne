import { useStore, useValue } from "nucleux";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import HomeAssistantService from "../services/home-assistant";
import IntentClassifierService from "../services/intent-classifier";
import OllamaService, { type Message } from "../services/ollama";
import PiperService from "../services/piper";
import ChatHistoryStore from "../stores/ChatHistoryStore";
import ModelStore from "../stores/ModelStore";
import SettingsStore from "../stores/SettingsStore";

import "./Chat.css";
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

  const chatHistoryStore = useStore(ChatHistoryStore);
  const settingsStore = useStore(SettingsStore);

  const activeModel = useValue(ModelStore, "activeModel");
  const messages = useValue(chatHistoryStore.messages);
  const ttsVoice = useValue(settingsStore.ttsVoice);
  const autoPlayTTS = useValue(settingsStore.autoPlayTTS);
  const isSpeaking = useValue(piperService.isSpeaking);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

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
  };

  const handleManualSpeak = async (text: string) => {
    if (isSpeaking) {
      piperService.stop();
    } else {
      await piperService.speak({ text, voice: ttsVoice });
    }
  };

  return (
    <div className="chat-container" style={{ padding: "20px" }}>
      <div
        className="messages"
        style={{
          minHeight: "400px",
          maxHeight: "400px",
          overflowY: "auto",
          border: "1px solid #ccc",
          padding: "10px",
          marginBottom: "20px",
        }}
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`message ${msg.role}`}
            style={{
              margin: "10px 0",
              padding: "10px",
              borderRadius: "8px",
              textAlign: "left",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <strong>{msg.role === "user" ? "You" : "Zion"}:</strong>
              {msg.role === "assistant" && (
                <button
                  onClick={() =>
                    handleManualSpeak(safeMessageContent(msg.content))
                  }
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "16px",
                    cursor: "pointer",
                    padding: "4px 8px",
                  }}
                  title={isSpeaking ? "Stop speaking" : "Speak this message"}
                >
                  {isSpeaking ? "🔇" : "🔊"}
                </button>
              )}
            </div>
            <div style={{ marginTop: "5px" }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {safeMessageContent(msg.content)}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {isStreaming && streamingMessage && (
          <div
            className="message assistant streaming"
            style={{
              margin: "10px 0",
              padding: "10px",
              borderRadius: "8px",
              textAlign: "left",
            }}
          >
            <strong>Zion:</strong>
            <div style={{ marginTop: "5px", display: "inline" }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {safeMessageContent(streamingMessage)}
              </ReactMarkdown>
              <span
                className="cursor"
                style={{
                  display: "inline-block",
                  width: "2px",
                  height: "1em",
                  backgroundColor: "#646cff",
                  marginLeft: "2px",
                  animation: "blink 1s infinite",
                  verticalAlign: "middle",
                }}
              />
            </div>
          </div>
        )}

        {loading && (
          <div
            className="message assistant"
            style={{ fontStyle: "italic", color: "#666" }}
          >
            Thinking...
          </div>
        )}

        {isSpeaking && (
          <div
            className="message assistant"
            style={{ fontStyle: "italic", color: "#646cff" }}
          >
            🔊 Speaking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <VoiceInput onTranscript={handleVoiceTranscript} />
        <div style={{ marginTop: "10px", fontSize: "14px", color: "#666" }}>
          Click microphone and speak your message
        </div>
      </div>

      <div className="input-area" style={{ display: "flex", gap: "10px" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyUp={(e) => e.key === "Enter" && handleSend()}
          placeholder="Or type your message..."
          style={{ flex: 1, padding: "10px", fontSize: "16px" }}
        />
        <button
          onClick={handleSend}
          disabled={loading || isStreaming}
          style={{ padding: "10px 20px", fontSize: "16px" }}
        >
          Send
        </button>
      </div>
    </div>
  );
};
