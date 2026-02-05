import { useStore, useValue } from "nucleux";
import React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DatabaseService from "@/services/database";
import ChatHistoryStore from "@/stores/ChatHistoryStore";

export const EmbeddingStatus: React.FC = () => {
  const dbService = useStore(DatabaseService);
  const chatHistoryStore = useStore(ChatHistoryStore);

  const stats = useValue(chatHistoryStore.stats);
  const embeddingProgress = useValue(chatHistoryStore.embeddingProgress);

  const unembeddedCount = stats.messages - stats.embeddedMessages;
  const embeddingPercentage =
    stats.messages > 0
      ? Math.round((stats.embeddedMessages / stats.messages) * 100)
      : 100;

  if (!dbService.isReady.value) {
    return null;
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Embedding Status</h3>
        {embeddingProgress.inProgress ? (
          <Badge variant="secondary" className="animate-pulse">
            Processing...
          </Badge>
        ) : unembeddedCount > 0 ? (
          <Badge variant="outline">Incomplete</Badge>
        ) : (
          <Badge variant="default">Complete</Badge>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Messages:</span>
          <span className="font-medium">{stats.messages}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Embedded:</span>
          <span className="font-medium">
            {stats.embeddedMessages} ({embeddingPercentage}%)
          </span>
        </div>

        {unembeddedCount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining:</span>
            <span className="font-medium text-orange-600 dark:text-orange-400">
              {unembeddedCount}
            </span>
          </div>
        )}

        {embeddingProgress.inProgress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>
                {embeddingProgress.completed} / {embeddingProgress.total}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${(embeddingProgress.completed / embeddingProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {unembeddedCount > 0 && (
          <Button
            onClick={chatHistoryStore.triggerEmbeddingBackfill}
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            disabled={embeddingProgress.inProgress}
          >
            Generate Embeddings
          </Button>
        )}
      </div>

      <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Database Size:</span>
          <span>{stats.dbSizeKB} KB</span>
        </div>
      </div>
    </div>
  );
};
