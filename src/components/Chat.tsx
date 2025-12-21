import { useStore, useValue } from "nucleux";
import React, { useState } from "react";
import HomeAssistantService from "../services/home-assistant";
import IntentClassifierService from "../services/intent-classifier";
import IntentParserService from "../services/intent-parser";
import OllamaService, { type Message } from "../services/ollama";
import { VoiceInput } from "./VoiceInput";

export const Chat: React.FC = () => {
  const intentClassifierService = useStore(IntentClassifierService);
  const intentParserService = useStore(IntentParserService);
  const ollamaService = useStore(OllamaService);
  const entities = useValue(HomeAssistantService, "entities");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

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
      } else {
        // TODO: move model to a global config
        const response = await ollamaService.chat("llama3.2:3b", [
          ...messages,
          userMessage,
        ]);

        setMessages((prev) => [...prev, response.message]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, something went wrong.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
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
      <h2>Zion Node Control</h2>

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
              // backgroundColor: msg.role === 'user' ? '#e3f2fd' : '#f5f5f5',
              borderRadius: "8px",
            }}
          >
            <strong>{msg.role === "user" ? "You" : "Zion"}:</strong>{" "}
            {msg.content}
          </div>
        ))}
        {loading && (
          <div
            className="message assistant"
            style={{ fontStyle: "italic", color: "#666" }}
          >
            Thinking...
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <VoiceInput onTranscript={handleVoiceTranscript} />
        <div style={{ marginTop: "10px", fontSize: "14px", color: "#666" }}>
          Click microphone and speak your command
        </div>
      </div>

      <div className="input-area" style={{ display: "flex", gap: "10px" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyUp={(e) => e.key === "Enter" && handleSend()}
          placeholder="Or type your command..."
          style={{ flex: 1, padding: "10px", fontSize: "16px" }}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          style={{ padding: "10px 20px", fontSize: "16px" }}
        >
          Send
        </button>
      </div>
    </div>
  );
};
