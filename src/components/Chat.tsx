import { useStore, useValue } from "nucleux";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import HomeAssistantService from "../services/home-assistant";
import IntentClassifierService from "../services/intent-classifier";
import IntentParserService from "../services/intent-parser";
import OllamaService, { type Message } from "../services/ollama";
import ModelStore from "../stores/ModelStore";

import "./Chat.css";
import { VoiceInput } from "./VoiceInput";

export const Chat: React.FC = () => {
  const intentClassifierService = useStore(IntentClassifierService);
  const intentParserService = useStore(IntentParserService);
  const ollamaService = useStore(OllamaService);
  const entities = useValue(HomeAssistantService, "entities");
  const activeModel = useValue(ModelStore, "activeModel");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  const processCommand = async (command: string) => {
    const userMessage: Message = { role: "user", content: command };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const intentType = await intentClassifierService.classifyIntent(command);

      if (intentType === "HOME_CONTROL") {
        const entityIds = entities.map((e) => e.entity_id);
        const result = await intentParserService.parseAndExecute(
          command,
          entityIds
        );

        const assistantMessage: Message = {
          role: "assistant",
          content: result.response,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setLoading(false);
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
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingMessage("");
        setIsStreaming(false);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, something went wrong.",
      };
      setMessages((prev) => [...prev, errorMessage]);
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
            }}
          >
            <strong>{msg.role === "user" ? "You" : "Zion"}:</strong>{" "}
            <div style={{ marginTop: "5px" }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content}
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
                {streamingMessage}
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
