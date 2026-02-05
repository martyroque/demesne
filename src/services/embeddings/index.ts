import { Store } from "nucleux";

import OllamaService from "../ollama";

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

class EmbeddingService extends Store {
  private ollamaService = this.inject(OllamaService);
  private model = "nomic-embed-text";
  private dimensions = 768;
  private cache = new Map<string, number[]>();
  private maxCacheSize = 1000;

  async embedText(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) {
      console.log(
        `EmbeddingService | Cache hit for: "${text.slice(0, 30)}..."`
      );
      return cached;
    }

    try {
      console.log(`EmbeddingService | Embedding: "${text.slice(0, 50)}..."`);

      const embedding = await this.ollamaService.embed(this.model, text);

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error("Invalid embedding response from Ollama");
      }

      if (embedding.length !== this.dimensions) {
        console.warn(
          `Warning: Expected ${this.dimensions} dimensions, got ${embedding.length}`
        );
      }

      this.updateCache(text, embedding);

      console.log(
        `EmbeddingService | Generated ${embedding.length}-dim embedding`
      );

      return embedding;
    } catch (error) {
      console.error("EmbeddingService | Failed:", error);
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    console.log(`EmbeddingService | Batch embedding ${texts.length} texts`);

    const embeddings = await Promise.all(
      texts.map((text) => this.embedText(text))
    );

    return embeddings;
  }

  private updateCache(text: string, embedding: number[]) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(text, embedding);
  }
}

export default EmbeddingService;
