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
    options?: {
      num_ctx?: number;
      num_predict?: number;
    }
  ): Promise<ChatResponse> {
    const response = await this.ollamaClient.post("/api/chat", {
      model,
      messages,
      stream: false,
      options: {
        num_ctx: options?.num_ctx ?? 8192,
        ...(options?.num_predict && { num_predict: options.num_predict }),
      },
    });
    return response.data;
  }

  async chatStream(
    model: string,
    messages: Message[],
    onChunk: (chunk: string) => void,
    options?: {
      timeout?: number;
    }
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutMs = options?.timeout ?? 30000;

    const timeoutId = setTimeout(() => {
      console.warn(`Stream timeout after ${timeoutMs}ms`);
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          options: { num_ctx: 8192 },
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
      let firstChunk = true;

      const forceFlushTimeout = setTimeout(() => {
        if (firstChunk && buffer.length > 0) {
          console.warn("Force flushing delayed first chunk");
          processBuffer();
        }
      }, 200);

      const processBuffer = () => {
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                onChunk(parsed.message.content);
                if (firstChunk) {
                  firstChunk = false;
                  clearTimeout(forceFlushTimeout);
                  clearTimeout(timeoutId);
                }
              }
            } catch (e) {
              console.error("Failed to parse chunk:", e, "Line:", line);
            }
          }
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            clearTimeout(forceFlushTimeout);
            clearTimeout(timeoutId);
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          processBuffer();
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error("Stream timeout - response took too long");
        }
        throw error;
      }
      throw new Error("Unknown streaming error");
    }
  }

  async embed(model: string, prompt: string): Promise<number[]> {
    const response = await this.ollamaClient.post("/api/embeddings", {
      model,
      prompt,
    });
    return (response.data.embedding ?? []) as number[];
  }

  async listModels() {
    const response = await this.ollamaClient.get("/api/tags");
    return response.data.models;
  }
}

export default OllamaService;
