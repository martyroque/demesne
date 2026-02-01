import { Store } from "nucleux";

import DatabaseService from "../../services/database";
import type { Message } from "../../services/ollama";

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
    return [...sessions].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
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
      }
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

    const allSessions = this.dbService.getAllSessions();

    if (allSessions.length === 0) {
      this.createNewSession();
    } else {
      if (!this.currentSessionId.value) {
        this.currentSessionId.value = allSessions[0].id;
      }

      this.dbVersion.value += 1;
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
}

export default ChatHistoryStore;
