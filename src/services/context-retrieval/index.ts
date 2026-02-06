import { Store } from "nucleux";

import DatabaseService from "../database";
import EmbeddingService from "../embeddings";

export interface ContextChunk {
  content: string;
  role: string;
  timestamp: number;
  similarity: number;
  messageId: number;
}

export interface RetrievalOptions {
  maxResults?: number;
  sessionId?: string;
  minSimilarity?: number;
  excludeRecent?: number;
}

class ContextRetrievalService extends Store {
  private dbService = this.inject(DatabaseService);
  private embeddingService = this.inject(EmbeddingService);

  public isSearching = this.atom(false);
  public lastSearchTime = this.atom(0);

  async retrieveRelevantContext(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<ContextChunk[]> {
    const {
      maxResults = 5,
      sessionId,
      minSimilarity = 0.7,
      excludeRecent = 60,
    } = options;

    if (!query.trim()) {
      console.warn("ContextRetrievalService | Empty query");
      return [];
    }

    this.isSearching.value = true;
    const startTime = performance.now();

    try {
      console.log(
        `ContextRetrievalService | Searching: "${query.slice(0, 50)}..."`
      );

      const queryEmbedding = await this.embeddingService.embedText(query);

      const results = await this.dbService.searchSimilar(
        queryEmbedding,
        maxResults * 2,
        sessionId,
        minSimilarity
      );

      const cutoffTime = Date.now() - excludeRecent * 1000;
      const filtered = results.filter((r) => r.timestamp < cutoffTime);

      const topResults = filtered.slice(0, maxResults);

      const chunks: ContextChunk[] = topResults.map((result) => ({
        content: result.content,
        role: result.role,
        timestamp: result.timestamp,
        similarity: result.similarity,
        messageId: result.id,
      }));

      const elapsedTime = Math.round(performance.now() - startTime);
      this.lastSearchTime.value = elapsedTime;

      console.log(
        `ContextRetrievalService | Found ${chunks.length} chunks in ${elapsedTime}ms`
      );

      if (chunks.length > 0) {
        console.log(
          `ContextRetrievalService | Top similarity: ${(chunks[0].similarity * 100).toFixed(1)}%`
        );
      }

      return chunks;
    } catch (error) {
      console.error("ContextRetrievalService | Search failed:", error);
      return [];
    } finally {
      this.isSearching.value = false;
    }
  }

  async searchAllConversations(
    query: string,
    options: Omit<RetrievalOptions, "sessionId"> = {}
  ): Promise<ContextChunk[]> {
    return this.retrieveRelevantContext(query, {
      ...options,
      sessionId: undefined,
    });
  }

  async searchCurrentSession(
    query: string,
    sessionId: string,
    options: Omit<RetrievalOptions, "sessionId"> = {}
  ): Promise<ContextChunk[]> {
    return this.retrieveRelevantContext(query, {
      ...options,
      sessionId,
    });
  }

  async findSimilarMessages(
    messageContent: string,
    options: RetrievalOptions = {}
  ): Promise<ContextChunk[]> {
    return this.retrieveRelevantContext(messageContent, {
      ...options,
      minSimilarity: 0.75,
    });
  }

  async retrieveDiverseContext(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<ContextChunk[]> {
    const allResults = await this.retrieveRelevantContext(query, {
      ...options,
      maxResults: (options.maxResults ?? 5) * 3, // get more candidates
    });

    const diverse: ContextChunk[] = [];
    const diversityThreshold = 0.85;

    for (const result of allResults) {
      let tooSimilar = false;

      for (const selected of diverse) {
        const lengthRatio =
          Math.min(result.content.length, selected.content.length) /
          Math.max(result.content.length, selected.content.length);

        if (lengthRatio > diversityThreshold) {
          tooSimilar = true;
          break;
        }
      }

      if (!tooSimilar) {
        diverse.push(result);
      }

      if (diverse.length >= (options.maxResults ?? 5)) {
        break;
      }
    }

    console.log(
      `ContextRetrievalService | Selected ${diverse.length} diverse chunks from ${allResults.length} candidates`
    );

    return diverse;
  }

  formatContextForPrompt(chunks: ContextChunk[]): string {
    if (chunks.length === 0) {
      return "";
    }

    const contextLines = chunks.map((chunk, idx) => {
      const date = new Date(chunk.timestamp).toLocaleString();
      const preview =
        chunk.content.length > 200
          ? chunk.content.slice(0, 200) + "..."
          : chunk.content;
      const similarity = (chunk.similarity * 100).toFixed(0);

      return `${idx + 1}. [${chunk.role}, ${date}, ${similarity}% match]\n   ${preview}`;
    });

    return `\n## Relevant Context from Past Conversations\n${contextLines.join("\n\n")}\n`;
  }
}

export default ContextRetrievalService;
