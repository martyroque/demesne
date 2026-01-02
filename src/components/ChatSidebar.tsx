import { formatDistanceToNow } from "date-fns";
import { useStore, useValue } from "nucleux";
import React from "react";

import HomeAssistantService from "../services/home-assistant";
import ChatHistoryStore from "../stores/ChatHistoryStore";

export const ChatSidebar: React.FC = () => {
  const chatHistoryStore = useStore(ChatHistoryStore);
  const homeAssistantService = useStore(HomeAssistantService);

  const sortedSessions = useValue(chatHistoryStore.sortedSessions);
  const sessionPreviews = useValue(chatHistoryStore.sessionPreviews);
  const currentSessionId = useValue(chatHistoryStore.currentSessionId);

  const handleNewChat = () => {
    chatHistoryStore.createNewSession();
    homeAssistantService.resetConversation();
  };

  const handleSessionClick = (sessionId: string) => {
    if (sessionId === currentSessionId) return;
    chatHistoryStore.setActiveSession(sessionId);
    homeAssistantService.resetConversation();
  };

  const formatTimestamp = (timestamp: number): string => {
    return formatDistanceToNow(timestamp, { addSuffix: true });
  };

  return (
    <div
      style={{
        width: "280px",
        backgroundColor: "#1a1a1a",
        borderRight: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "20px",
          borderBottom: "1px solid #333",
        }}
      >
        <button
          onClick={handleNewChat}
          style={{
            width: "100%",
            padding: "12px",
            fontSize: "14px",
            backgroundColor: "#646cff",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          + New Chat
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px",
        }}
      >
        {sortedSessions.map((session) => (
          <div
            key={session.id}
            onClick={() => handleSessionClick(session.id)}
            style={{
              padding: "12px",
              marginBottom: "8px",
              borderRadius: "8px",
              cursor: "pointer",
              backgroundColor:
                session.id === currentSessionId ? "#2a2a2a" : "transparent",
              border:
                session.id === currentSessionId
                  ? "1px solid #646cff"
                  : "1px solid transparent",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (session.id !== currentSessionId) {
                e.currentTarget.style.backgroundColor = "#222";
              }
            }}
            onMouseLeave={(e) => {
              if (session.id !== currentSessionId) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            <div
              style={{
                fontSize: "14px",
                color: "rgba(255, 255, 255, 0.87)",
                marginBottom: "4px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sessionPreviews[session.id]}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "rgba(255, 255, 255, 0.5)",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{formatTimestamp(session.lastActiveAt)}</span>
              <span>{session.messages.length} msgs</span>
            </div>
          </div>
        ))}

        {sortedSessions.length === 0 && (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: "14px",
            }}
          >
            No chats yet
          </div>
        )}
      </div>

      <div
        style={{
          padding: "16px",
          borderTop: "1px solid #333",
          fontSize: "12px",
          color: "rgba(255, 255, 255, 0.5)",
        }}
      >
        {sortedSessions.length} chat{sortedSessions.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
};
