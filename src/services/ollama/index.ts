import axios from "axios";
import { Store } from "nucleux";

const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL || "http://localhost:11434";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  model: string;
  message: Message;
  done: boolean;
}

class OllamaService extends Store {
  private ollamaClient = axios.create({
    baseURL: OLLAMA_URL,
  });

  async chat(
    model: string,
    messages: Message[],
    stream: boolean = false
  ): Promise<ChatResponse> {
    const response = await this.ollamaClient.post("/api/chat", {
      model,
      messages,
      stream,
      options: {
        num_ctx: 8192,
      },
    });
    return response.data;
  }

  async chatStream(
    model: string,
    messages: Message[],
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: {
          num_ctx: 8192,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is null");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                onChunk(parsed.message.content);
              }
            } catch (e) {
              console.error("Failed to parse chunk:", e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listModels() {
    const response = await this.ollamaClient.get("/api/tags");
    return response.data.models;
  }
}

export default OllamaService;
