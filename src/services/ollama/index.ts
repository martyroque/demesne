import { Store } from "nucleux";
import axios from 'axios';

const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';

export interface Message {
  role: 'system' | 'user' | 'assistant';
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
    const response = await this.ollamaClient.post('/api/chat', {
      model,
      messages,
      stream,
    });
    return response.data;
  }

  async listModels() {
    const response = await this.ollamaClient.get('/api/tags');
    return response.data.models;
  }
}

export default OllamaService;
