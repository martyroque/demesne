import { Store } from "nucleux";
import type { Message } from "../../services/ollama";

interface MessageWithTimestamp extends Message {
  timestamp: number;
}

interface ChatSession {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  messages: MessageWithTimestamp[];
}

class ChatHistoryStore extends Store {
  public sessions = this.atom<ChatSession[]>([], {
    persistence: { persistKey: "demesne-sessions" },
  });

  public currentSessionId = this.atom<string | null>(null, {
    persistence: { persistKey: "demesne-current-session" },
  });

  public messages = this.deriveAtom(
    [this.sessions, this.currentSessionId],
    (sessions, currentSessionId) => {
      if (!currentSessionId) {
        return [];
      }
      const currentSession = sessions.find((s) => s.id === currentSessionId);
      return currentSession?.messages || [];
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

  public totalMessageCount = this.deriveAtom([this.sessions], (sessions) => {
    return sessions.reduce(
      (total, session) => total + session.messages.length,
      0
    );
  });

  public currentSessionMessageCount = this.deriveAtom(
    [this.currentSession],
    (currentSession) => {
      return currentSession?.messages.length || 0;
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
          // Find first user message
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

    // If no sessions exist, create initial session
    if (this.sessions.value.length === 0) {
      this.createNewSession();
    }

    // If no current session set, use the most recent one
    if (!this.currentSessionId.value && this.sessions.value.length > 0) {
      this.currentSessionId.value =
        this.sessions.value[this.sessions.value.length - 1].id;
    }
  }

  createNewSession(): string {
    const sessionId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: sessionId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      messages: [],
    };

    this.sessions.value = [...this.sessions.value, newSession];
    this.currentSessionId.value = sessionId;

    return sessionId;
  }

  setActiveSession(sessionId: string) {
    if (this.sessions.value.find((s) => s.id === sessionId)) {
      this.currentSessionId.value = sessionId;
    }
  }

  async addMessage(message: Message) {
    const sessionId = this.currentSessionId.value;
    if (!sessionId) {
      console.error("No active session");
      return;
    }

    const messageWithTimestamp: MessageWithTimestamp = {
      ...message,
      timestamp: Date.now(),
    };

    this.sessions.value = this.sessions.value.map((session) => {
      if (session.id === sessionId) {
        return {
          ...session,
          messages: [...session.messages, messageWithTimestamp],
          lastActiveAt: Date.now(),
        };
      }
      return session;
    });
  }

  async clearHistory() {
    if (confirm("Clear all chat history? This cannot be undone.")) {
      this.sessions.value = [];
      this.currentSessionId.value = null;
      this.createNewSession();
    }
  }
}

export default ChatHistoryStore;
