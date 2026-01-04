import { formatDistanceToNow } from "date-fns";
import { useStore, useValue } from "nucleux";
import React from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
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
        {sortedSessions.length === 0 ? (
          <div className="p-5 text-center text-sm text-muted-foreground">
            No chats yet
          </div>
        ) : (
          <div className="space-y-2">
            {sortedSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleSessionClick(session.id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-all",
                  "hover:bg-accent",
                  session.id === currentSessionId
                    ? "border-primary bg-accent"
                    : "border-transparent"
                )}
              >
                <div className="mb-1 line-clamp-2 text-sm text-foreground">
                  {sessionPreviews[session.id]}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatTimestamp(session.lastActiveAt)}</span>
                  <span className="shrink-0">
                    {session.messages.length} msg
                    {session.messages.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-border p-4 text-xs text-muted-foreground">
        {sortedSessions.length} chat{sortedSessions.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
};
