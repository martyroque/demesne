import { useStore, useValue } from "nucleux";
import React, { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import ContextRetrievalService, {
  type ContextChunk,
} from "@/services/context-retrieval";
import { formatDistanceToNow } from "date-fns";

export const SearchPastChats: React.FC = () => {
  const contextRetrieval = useStore(ContextRetrievalService);

  const isSearching = useValue(contextRetrieval.isSearching);
  const lastSearchTime = useValue(contextRetrieval.lastSearchTime);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContextChunk[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setSearchPerformed(true);
    setResults([]);

    try {
      const chunks = await contextRetrieval.retrieveRelevantContext(query, {
        maxResults: 10,
        minSimilarity: 0.5,
      });

      setResults(chunks);
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    return formatDistanceToNow(timestamp, { addSuffix: true });
  };

  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 0.8) return "text-green-600 dark:text-green-400";
    if (similarity >= 0.7) return "text-blue-600 dark:text-blue-400";
    if (similarity >= 0.6) return "text-orange-600 dark:text-orange-400";
    return "text-muted-foreground";
  };

  const getSimilarityLabel = (similarity: number): string => {
    if (similarity >= 0.8) return "Very Similar";
    if (similarity >= 0.7) return "Similar";
    if (similarity >= 0.6) return "Somewhat Similar";
    return "Related";
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="default" className="gap-2">
          🔍 Search Chats
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Search Conversation History</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search for topics, questions, or commands..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
              disabled={isSearching}
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              className="shrink-0"
            >
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>

          {searchPerformed && !isSearching && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Found {results.length} result{results.length !== 1 ? "s" : ""}
              </span>
              {lastSearchTime > 0 && (
                <>
                  <Separator orientation="vertical" className="h-3" />
                  <span>{lastSearchTime}ms</span>
                </>
              )}
            </div>
          )}

          <ScrollArea className="max-h-[500px]">
            {!searchPerformed && (
              <div className="flex h-[200px] items-center justify-center text-center text-sm text-muted-foreground">
                <div>
                  <div className="mb-2 text-4xl">🔍</div>
                  <div>Search for anything in your conversation history</div>
                  <div className="mt-1 text-xs">
                    Uses semantic search to find relevant messages
                  </div>
                </div>
              </div>
            )}

            {searchPerformed && results.length === 0 && !isSearching && (
              <div className="flex h-[200px] items-center justify-center text-center text-sm text-muted-foreground">
                <div>
                  <div className="mb-2 text-4xl">🤷</div>
                  <div>No results found</div>
                  <div className="mt-1 text-xs">
                    Try different keywords or lower the similarity threshold
                  </div>
                </div>
              </div>
            )}

            {isSearching && (
              <div className="flex h-[200px] items-center justify-center">
                <div className="text-center">
                  <div className="mb-2 text-2xl">⏳</div>
                  <div className="text-sm text-muted-foreground">
                    Searching...
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {results.map((chunk, idx) => (
                <Card key={`${chunk.messageId}-${idx}`} className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          chunk.role === "user" ? "default" : "secondary"
                        }
                        className="shrink-0"
                      >
                        {chunk.role === "user" ? "You" : "Zion"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(chunk.timestamp)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span
                        className={`text-xs font-medium ${getSimilarityColor(chunk.similarity)}`}
                      >
                        {(chunk.similarity * 100).toFixed(0)}%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {getSimilarityLabel(chunk.similarity)}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm leading-relaxed">
                    {chunk.content.length > 300
                      ? chunk.content.slice(0, 300) + "..."
                      : chunk.content}
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
