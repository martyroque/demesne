import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import { useStore, useValue } from "nucleux";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import HomeAssistantService from "@/services/home-assistant";
import ChatHistoryStore, {
  HOME_CONTROL_SESSION_ID,
} from "@/stores/ChatHistoryStore";

export const ChatSidebar: React.FC = () => {
  const chatHistoryStore = useStore(ChatHistoryStore);
  const homeAssistantService = useStore(HomeAssistantService);

  const sortedSessions = useValue(chatHistoryStore.sortedSessions);
  const sessionPreviews = useValue(chatHistoryStore.sessionPreviews);
  const currentSessionId = useValue(chatHistoryStore.currentSessionId);
  const homeControlSession = useValue(chatHistoryStore.homeControlSession);

  const [showCommandLog, setShowCommandLog] = useState(false);

  const handleNewChat = () => {
    chatHistoryStore.createNewSession();
    homeAssistantService.resetConversation();
  };

  const handleCommandLogToggle = () => {
    if (!showCommandLog) {
      setShowCommandLog(true);
      chatHistoryStore.setActiveSession(HOME_CONTROL_SESSION_ID);
    } else {
      setShowCommandLog(false);
      const firstSession = sortedSessions[0];
      if (firstSession) {
        chatHistoryStore.setActiveSession(firstSession.id);
      }
    }
  };

  const handleSessionClick = (sessionId: string) => {
    if (sessionId === currentSessionId) return;
    chatHistoryStore.setActiveSession(sessionId);
    homeAssistantService.resetConversation();
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (sortedSessions.length === 1) {
      alert("Cannot delete the last chat session");
      return;
    }

    if (confirm("Delete this chat? This cannot be undone.")) {
      chatHistoryStore.deleteSession(sessionId);
      homeAssistantService.resetConversation();
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    return formatDistanceToNow(timestamp, { addSuffix: true });
  };

  return (
    <div className="flex h-screen w-[280px] flex-col overflow-hidden border-r border-border bg-sidebar">
      <div className="border-b border-border p-5">
        <Button
          onClick={handleNewChat}
          className="w-full font-medium"
          size="lg"
        >
          <span className="mr-2">+</span>
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1 p-2.5">
        {showCommandLog ? (
          <div className="space-y-2">
            <button
              onClick={handleCommandLogToggle}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              ← Chats
            </button>
            <div className="px-2 py-1 text-xs text-muted-foreground">
              Home control command history
            </div>
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="p-5 text-center text-sm text-muted-foreground">
            No chats yet
          </div>
        ) : (
          <div className="space-y-2">
            {sortedSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleSessionClick(session.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSessionClick(session.id);
                  }
                }}
                className={cn(
                  "group relative w-full rounded-lg border p-3 text-left transition-all cursor-pointer",
                  "hover:bg-accent",
                  session.id === currentSessionId
                    ? "border-primary bg-accent"
                    : "border-transparent"
                )}
              >
                <div className="mb-1 line-clamp-2 pr-8 text-sm text-foreground">
                  {sessionPreviews[session.id]}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatTimestamp(session.lastActiveAt)}</span>
                  <span className="shrink-0">
                    {session.messages.length} msg
                    {session.messages.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className={cn(
                    "absolute top-3 right-3 rounded p-1 opacity-0 transition-opacity",
                    "hover:bg-destructive/10 hover:text-destructive",
                    "group-hover:opacity-100",
                    "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-destructive/50"
                  )}
                  aria-label="Delete chat"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-border p-4 text-xs text-muted-foreground">
        <span>
          {sortedSessions.length} chat{sortedSessions.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={handleCommandLogToggle}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 transition-colors hover:text-foreground",
            showCommandLog ? "text-amber-500" : "text-muted-foreground"
          )}
          title={`Command log (${homeControlSession?.messages.length ?? 0} entries)`}
        >
          <span>Command Log</span>
        </button>
      </div>
    </div>
  );
};
