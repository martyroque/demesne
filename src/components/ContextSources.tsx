import React from "react";

import { Badge } from "@/components/ui/badge";
import type { ContextChunk } from "@/services/context-retrieval";

interface ContextSourcesProps {
  sources: ContextChunk[];
  className?: string;
}

export const ContextSources: React.FC<ContextSourcesProps> = ({
  sources,
  className = "",
}) => {
  if (sources.length === 0) return null;

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 0.8)
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (similarity >= 0.7)
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
  };

  return (
    <details className={`mt-3 text-xs ${className}`}>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
        Used {sources.length} past conversation{sources.length > 1 ? "s" : ""}
      </summary>

      <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3">
        {sources.map((src, idx) => (
          <div
            key={`${src.messageId}-${idx}`}
            className="flex items-start gap-2 text-xs"
          >
            <Badge
              variant="outline"
              className={`shrink-0 ${getSimilarityColor(src.similarity)}`}
            >
              {(src.similarity * 100).toFixed(0)}%
            </Badge>

            <div className="flex-1 space-y-1">
              <div className="text-muted-foreground">
                {formatTimestamp(src.timestamp)} •{" "}
                {src.role === "user" ? "You" : "Zion"}
              </div>

              <div className="text-foreground/80">
                "{src.content.slice(0, 100)}
                {src.content.length > 100 ? "..." : ""}"
              </div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
};
