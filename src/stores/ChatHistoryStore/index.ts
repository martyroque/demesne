import { Store } from "nucleux";

import DatabaseService from "../../services/database";
import type { Message } from "../../services/ollama";

export const HOME_CONTROL_SESSION_ID = "home-control";

interface MessageWithTimestamp extends Message {
  timestamp: number;
}

interface ChatSessionWithMessages {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  messages: MessageWithTimestamp[];
}

class ChatHistoryStore extends Store {
  private dbService = this.inject(DatabaseService);
  private dbVersion = this.atom(0);

  public currentSessionId = this.atom<string | null>(null, {
    persistence: { persistKey: "demesne-current-session" },
  });

  public messages = this.deriveAtom(
    [this.currentSessionId, this.dbVersion],
    (sessionId) => {
      if (!sessionId) return [];
      return this.dbService.getSessionMessages(sessionId);
    }
  );

  public sessions = this.deriveAtom(
    [this.dbVersion],
    (): ChatSessionWithMessages[] => {
      const dbSessions = this.dbService.getAllSessions();

      return dbSessions.map((session) => ({
        id: session.id,
        createdAt: session.created_at,
        lastActiveAt: session.last_active_at,
        messages: this.dbService.getSessionMessages(session.id),
      }));
    }
  );

  public currentSession = this.deriveAtom(
    [this.sessions, this.currentSessionId],
    (sessions, currentSessionId) => {
      if (!currentSessionId) {
        return null;
      }
      return sessions.find((s) => s.id === currentSessionId) || null;
    }
  );

  public totalMessageCount = this.deriveAtom([this.dbVersion], () => {
    return this.dbService.getTotalMessageCount();
  });

  public currentSessionMessageCount = this.deriveAtom(
    [this.currentSessionId, this.dbVersion],
    (sessionId) => {
      if (!sessionId) return 0;
      return this.dbService.getMessageCount(sessionId);
    }
  );

  public sortedSessions = this.deriveAtom([this.sessions], (sessions) => {
    return [...sessions]
      .filter((s) => s.id !== HOME_CONTROL_SESSION_ID)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  });

  public homeControlSession = this.deriveAtom([this.sessions], (sessions) => {
    return sessions.find((s) => s.id === HOME_CONTROL_SESSION_ID) || null;
  });

  public sessionPreviews = this.deriveAtom([this.sessions], (sessions) => {
    return sessions.reduce(
      (previews, session) => {
        if (session.messages.length === 0) {
          previews[session.id] = "New chat";
        } else {
          const firstUserMessage = session.messages.find(
            (m) => m.role === "user"
          );
          if (firstUserMessage) {
            previews[session.id] =
              firstUserMessage.content.slice(0, 50) +
              (firstUserMessage.content.length > 50 ? "..." : "");
          } else {
            previews[session.id] = "Chat";
          }
        }
        return previews;
      },
      {} as Record<string, string>
    );
  });

  public embeddingProgress = this.deriveAtom(
    [this.dbService.embeddingProgress],
    (progress) => progress
  );

  public stats = this.deriveAtom([this.dbVersion], () => {
    return this.dbService.getDatabaseStats();
  });

  constructor() {
    super();

    this.watchAtom(this.dbService.isReady, (isReady) => {
      if (isReady) {
        this.initChatHistory();

        setTimeout(() => {
          if (this.shouldVacuum()) {
            console.log("Database needs optimization, running VACUUM...");
            this.vacuum();
          }
        }, 10000);

        setTimeout(() => {
          this.checkAndBackfillEmbeddings();
        }, 15000);
      }
    });

    this.watchAtom(this.dbService.embeddingVersion, () => {
      this.dbVersion.value += 1;
    });
  }

  private shouldVacuum(): boolean {
    const stats = this.dbService.getDatabaseStats();

    const lastVacuum = localStorage.getItem("last-vacuum");
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return (
      stats.dbSizeKB > 1024 &&
      (!lastVacuum || parseInt(lastVacuum) < sevenDaysAgo) &&
      stats.sessions < stats.messages / 50
    );
  }

  private initChatHistory() {
    if (this.dbService.isReady.value == false) {
      console.error("Database is not ready");
      return;
    }

    if (!this.dbService.getSession(HOME_CONTROL_SESSION_ID)) {
      this.dbService.createSession(HOME_CONTROL_SESSION_ID);
    }

    const allSessions = this.dbService.getAllSessions();
    const visibleSessions = allSessions.filter(
      (s) => s.id !== HOME_CONTROL_SESSION_ID
    );

    if (visibleSessions.length === 0) {
      this.createNewSession();
    } else {
      if (!this.currentSessionId.value) {
        this.currentSessionId.value = visibleSessions[0].id;
      }

      this.dbVersion.value += 1;
    }
  }

  private async checkAndBackfillEmbeddings() {
    const stats = this.dbService.getDatabaseStats();
    const unembeddedCount = stats.messages - stats.embeddedMessages;

    if (unembeddedCount > 0) {
      console.log(
        `ChatHistoryStore | Found ${unembeddedCount} unembedded messages, starting backfill...`
      );

      await this.dbService.backfillEmbeddings((completed, total) => {
        console.log(
          `ChatHistoryStore | Embedding progress: ${completed}/${total}`
        );
      });

      console.log("ChatHistoryStore | Backfill complete");

      this.dbVersion.value += 1;
    } else {
      console.log("ChatHistoryStore | All messages already embedded");
    }
  }

  createNewSession(): string {
    const sessionId = `session-${Date.now()}`;

    this.dbService.createSession(sessionId);

    this.currentSessionId.value = sessionId;

    this.dbVersion.value += 1;

    return sessionId;
  }

  setActiveSession(sessionId: string) {
    const session = this.dbService.getSession(sessionId);
    if (session) {
      this.currentSessionId.value = sessionId;
    }
  }

  addMessage(message: Message) {
    const sessionId = this.currentSessionId.value;
    if (!sessionId) {
      console.error("No active session");
      return;
    }

    const timestamp = Date.now();

    this.dbService.saveMessage(
      sessionId,
      message.role,
      message.content,
      timestamp
    );

    this.dbVersion.value += 1;
  }

  addMessageToSession(sessionId: string, message: Message) {
    if (!this.dbService.getSession(sessionId)) {
      this.dbService.createSession(sessionId);
    }

    const timestamp = Date.now();

    this.dbService.saveMessage(
      sessionId,
      message.role,
      message.content,
      timestamp
    );

    this.dbVersion.value += 1;
  }

  vacuum() {
    console.log("Optimizing database...");
    this.dbService.vacuum();
    localStorage.setItem("last-vacuum", Date.now().toString());
    console.log("Database optimized");
  }

  clearHistory() {
    if (confirm("Clear all chat history? This cannot be undone.")) {
      const allSessions = this.dbService.getAllSessions();
      allSessions.forEach((session) => {
        this.dbService.deleteSession(session.id);
      });

      this.currentSessionId.value = null;
      this.dbVersion.value += 1;

      this.createNewSession();

      this.vacuum();
    }
  }

  deleteSession(sessionId: string) {
    const allSessions = this.dbService.getAllSessions();
    if (allSessions.length === 1) {
      alert("Cannot delete the last chat session");
      return;
    }

    const isCurrentSession = this.currentSessionId.value === sessionId;

    this.dbService.deleteSession(sessionId);

    if (isCurrentSession) {
      const remainingSessions = this.dbService.getAllSessions();
      if (remainingSessions.length > 0) {
        this.setActiveSession(remainingSessions[0].id);
      }
    }

    this.dbVersion.value += 1;
  }

  async triggerEmbeddingBackfill(): Promise<void> {
    await this.checkAndBackfillEmbeddings();
  }
}

export default ChatHistoryStore;
