import { Store } from "nucleux";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

import EmbeddingService from "../embeddings";
import type { Message } from "../ollama";
import QdrantService from "../qdrant";

interface MessageWithTimestamp extends Message {
  id: number;
  timestamp: number;
}

interface ChatSession {
  id: string;
  created_at: number;
  last_active_at: number;
}

class DatabaseService extends Store {
  private db: SqlJsDatabase | null = null;
  public isReady = this.atom(false);

  private embeddingService = this.inject(EmbeddingService);
  private qdrantService = this.inject(QdrantService);
  private embeddingQueue: Set<number> = new Set();
  public embeddingProgress = this.atom<{
    total: number;
    completed: number;
    inProgress: boolean;
  }>({
    total: 0,
    completed: 0,
    inProgress: false,
  });
  public embeddingVersion = this.atom(0);

  constructor() {
    super();
    this.initDatabase();
  }

  private async initDatabase() {
    try {
      const SQL = await initSqlJs({
        locateFile: (file) => `https://sql.js.org/dist/${file}`,
      });

      const savedDb = localStorage.getItem("demesne-db");
      if (savedDb) {
        const buffer = this.base64ToUint8Array(savedDb);
        this.db = new SQL.Database(buffer);
        console.log("Loaded existing database from localStorage");
      } else {
        this.db = new SQL.Database();
        console.log("Created new database");
      }

      this.initSchema();
      this.isReady.value = true;
      this.qdrantService.ensureCollection().catch((error) => {
        console.error("QdrantService | Failed to ensure collection:", error);
      });
    } catch (error) {
      console.error("Failed to initialize database:", error);
      throw error;
    }
  }

  private initSchema() {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        embedding BLOB,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );
    `);

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, timestamp);`
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON chat_messages(timestamp DESC);`
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_sessions_active ON chat_sessions(last_active_at DESC);`
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_embedded ON chat_messages(id) WHERE embedding IS NOT NULL;`
    );

    // One-time migration: clear old embedding blobs so backfill re-runs into Qdrant
    const migrationKey = "demesne-qdrant-migration-v1";
    if (!localStorage.getItem(migrationKey)) {
      this.db.run(`UPDATE chat_messages SET embedding = NULL`);
      localStorage.setItem(migrationKey, "1");
      console.log("DatabaseService | Reset embeddings for Qdrant migration");
    }
  }

  private persist() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const base64 = this.uint8ArrayToBase64(data);
      localStorage.setItem("demesne-db", base64);
    } catch (error) {
      console.error("Failed to persist database:", error);
    }
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    const len = bytes.length;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  createSession(sessionId: string): void {
    if (!this.db) throw new Error("Database not initialized");

    const now = Date.now();
    this.db.run(
      `INSERT OR IGNORE INTO chat_sessions (id, created_at, last_active_at) VALUES (?, ?, ?)`,
      [sessionId, now, now]
    );
    this.persist();
  }

  getSession(sessionId: string): ChatSession | null {
    if (!this.db) return null;

    const result = this.db.exec(
      `SELECT id, created_at, last_active_at FROM chat_sessions WHERE id = ?`,
      [sessionId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      created_at: row[1] as number,
      last_active_at: row[2] as number,
    };
  }

  getAllSessions(): ChatSession[] {
    if (!this.db) return [];

    const result = this.db.exec(`
      SELECT id, created_at, last_active_at
      FROM chat_sessions
      ORDER BY last_active_at DESC
    `);

    if (result.length === 0) return [];

    return result[0].values.map((row) => ({
      id: row[0] as string,
      created_at: row[1] as number,
      last_active_at: row[2] as number,
    }));
  }

  updateSessionActivity(sessionId: string): void {
    if (!this.db) return;

    this.db.run(`UPDATE chat_sessions SET last_active_at = ? WHERE id = ?`, [
      Date.now(),
      sessionId,
    ]);
    this.persist();
  }

  deleteSession(sessionId: string): void {
    if (!this.db) return;

    this.db.run(`DELETE FROM chat_sessions WHERE id = ?`, [sessionId]);
    this.persist();
  }

  saveMessage(
    sessionId: string,
    role: string,
    content: string,
    timestamp?: number
  ): number {
    if (!this.db) throw new Error("Database not initialized");

    this.createSession(sessionId);

    const ts = timestamp ?? Date.now();

    const result = this.db.exec(
      `INSERT INTO chat_messages (session_id, role, content, timestamp)
      VALUES (?, ?, ?, ?)
      RETURNING id`,
      [sessionId, role, content, ts]
    );

    this.updateSessionActivity(sessionId);

    const messageId = result[0].values[0][0] as number;

    if (!messageId) {
      console.error("DatabaseService | Failed to get message ID after insert");
      return 0;
    }

    console.log(`DatabaseService | Saved message with ID ${messageId}`);

    this.persist();
    this.queueEmbedding(messageId, content, sessionId, role, ts);

    return messageId;
  }

  private async queueEmbedding(
    messageId: number,
    content: string,
    sessionId: string,
    role: string,
    timestamp: number
  ) {
    if (this.embeddingQueue.has(messageId)) return;

    this.embeddingQueue.add(messageId);

    try {
      const embedding = await this.embeddingService.embedText(content);
      await this.qdrantService.upsertPoint(messageId, embedding, {
        session_id: sessionId,
        role,
        content,
        timestamp,
      });
      this.updateEmbedding(messageId);
      console.log(`DatabaseService | Embedded message ${messageId}`);
      this.embeddingVersion.value += 1;
    } catch (error) {
      console.error(
        `DatabaseService | Failed to embed message ${messageId}:`,
        error
      );
    } finally {
      this.embeddingQueue.delete(messageId);
    }
  }

  private updateEmbedding(messageId: number) {
    if (!this.db) return;

    this.db.run(`UPDATE chat_messages SET embedding = ? WHERE id = ?`, [
      new Uint8Array([1]),
      messageId,
    ]);

    this.persist();
  }

  getSessionMessages(
    sessionId: string,
    limit?: number
  ): MessageWithTimestamp[] {
    if (!this.db) return [];

    const sql = `
      SELECT id, role, content, timestamp
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      ${limit ? `LIMIT ${limit}` : ""}
    `;

    const result = this.db.exec(sql, [sessionId]);

    if (result.length === 0) return [];

    return result[0].values.map((row) => ({
      id: row[0] as number,
      role: row[1] as "user" | "assistant" | "system",
      content: row[2] as string,
      timestamp: row[3] as number,
    }));
  }

  getMessageCount(sessionId: string): number {
    if (!this.db) return 0;

    const result = this.db.exec(
      `SELECT COUNT(*) as count FROM chat_messages WHERE session_id = ?`,
      [sessionId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }

    return result[0].values[0][0] as number;
  }

  getTotalMessageCount(): number {
    if (!this.db) return 0;

    const result = this.db.exec(`SELECT COUNT(*) as count FROM chat_messages`);

    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }

    return result[0].values[0][0] as number;
  }

  getUnembeddedMessages(): Array<{
    id: number;
    content: string;
    sessionId: string;
    role: string;
    timestamp: number;
  }> {
    if (!this.db) return [];

    const result = this.db.exec(
      `SELECT id, content, session_id, role, timestamp FROM chat_messages WHERE embedding IS NULL ORDER BY timestamp ASC`
    );

    if (result.length === 0) return [];

    return result[0].values.map((row) => ({
      id: row[0] as number,
      content: row[1] as string,
      sessionId: row[2] as string,
      role: row[3] as string,
      timestamp: row[4] as number,
    }));
  }

  getEmbeddedMessageCount(): number {
    if (!this.db) return 0;

    const result = this.db.exec(
      `SELECT COUNT(*) as count FROM chat_messages WHERE embedding IS NOT NULL`
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }

    return result[0].values[0][0] as number;
  }

  async backfillEmbeddings(
    onProgress?: (completed: number, total: number) => void
  ) {
    const unembedded = this.getUnembeddedMessages();

    if (unembedded.length === 0) {
      console.log("DatabaseService | All messages already embedded");
      return;
    }

    console.log(
      `DatabaseService | Backfilling ${unembedded.length} messages...`
    );

    this.embeddingProgress.value = {
      total: unembedded.length,
      completed: 0,
      inProgress: true,
    };

    const batchSize = 10;

    for (let i = 0; i < unembedded.length; i += batchSize) {
      const batch = unembedded.slice(i, i + batchSize);

      try {
        const embeddings = await this.embeddingService.embedBatch(
          batch.map((msg) => msg.content)
        );

        await Promise.all(
          batch.map((msg, idx) =>
            this.qdrantService.upsertPoint(msg.id, embeddings[idx], {
              session_id: msg.sessionId,
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp,
            })
          )
        );

        batch.forEach((msg) => this.updateEmbedding(msg.id));

        const completed = Math.min(i + batchSize, unembedded.length);
        this.embeddingProgress.value = {
          total: unembedded.length,
          completed,
          inProgress: true,
        };

        if (onProgress) {
          onProgress(completed, unembedded.length);
        }

        console.log(
          `DatabaseService | Progress: ${completed}/${unembedded.length}`
        );
      } catch (error) {
        console.error(
          `DatabaseService | Batch ${i}-${i + batchSize} failed:`,
          error
        );
      }
    }

    this.embeddingProgress.value = {
      total: unembedded.length,
      completed: unembedded.length,
      inProgress: false,
    };

    console.log("DatabaseService | Backfill complete");
  }

  vacuum(): void {
    if (!this.db) return;

    this.db.run("VACUUM");
    this.persist();
  }

  close(): void {
    if (this.db) {
      this.persist();
      this.db.close();
      this.db = null;
    }
  }

  getDatabaseStats(): {
    sessions: number;
    messages: number;
    embeddedMessages: number;
    dbSizeKB: number;
  } {
    if (!this.db) {
      return { sessions: 0, messages: 0, embeddedMessages: 0, dbSizeKB: 0 };
    }

    const sessionsResult = this.db.exec(
      `SELECT COUNT(*) as count FROM chat_sessions`
    );
    const messagesResult = this.db.exec(
      `SELECT COUNT(*) as count FROM chat_messages`
    );
    const embeddedResult = this.db.exec(
      `SELECT COUNT(*) as count FROM chat_messages WHERE embedding IS NOT NULL`
    );

    const sessions =
      sessionsResult.length > 0
        ? (sessionsResult[0].values[0][0] as number)
        : 0;
    const messages =
      messagesResult.length > 0
        ? (messagesResult[0].values[0][0] as number)
        : 0;
    const embeddedMessages =
      embeddedResult.length > 0
        ? (embeddedResult[0].values[0][0] as number)
        : 0;

    const savedDb = localStorage.getItem("demesne-db");
    const dbSizeKB = savedDb ? Math.round(savedDb.length / 1024) : 0;

    return {
      sessions,
      messages,
      embeddedMessages,
      dbSizeKB,
    };
  }

  destroy(): void {
    this.close();
    super.destroy();
  }
}

export default DatabaseService;
