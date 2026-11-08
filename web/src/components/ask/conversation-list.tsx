"use client";

import { MessageSquarePlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { useConversations, useDeleteConversation } from "@/hooks/use-chat";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/ai";

interface ConversationListProps {
  activeId: number | null;
  onSelect: (id: number | null) => void;
  className?: string;
}

export function ConversationList({ activeId, onSelect, className }: ConversationListProps) {
  const q = useConversations();
  const del = useDeleteConversation();
  const items: Conversation[] = q.data?.conversations ?? [];

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <Button variant="outline" className="w-full justify-start" onClick={() => onSelect(null)}>
        <MessageSquarePlusIcon data-icon="inline-start" /> New chat
      </Button>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {q.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}
          </div>
        ) : q.isError ? (
          <ErrorState className="py-8" title="Couldn't load chats" error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No chats yet. Ask your first question.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "w-full rounded-2xl px-3 py-2.5 pr-10 text-left transition",
                      active ? "bg-coral-soft" : "hover:bg-muted",
                    )}
                  >
                    <span className={cn("block truncate text-sm", active ? "font-bold text-primary" : "font-semibold")}>{c.title || "Chat"}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {c.petName ? `${c.petName} · ` : ""}
                      {timeAgo(c.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete chat"
                    onClick={() => {
                      del.mutate(c.id);
                      if (active) onSelect(null);
                    }}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-background hover:text-destructive focus-visible:opacity-100"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
