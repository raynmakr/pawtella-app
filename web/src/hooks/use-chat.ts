"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiService, CHAT_TIMEOUT_MS } from "@/services/ai";
import { queryKeys } from "@/lib/query-keys";
import { ApiError } from "@/lib/api";
import { useSession } from "@/stores/session";
import type { ChatMessage, ConversationDetail, ConversationsPage, SendChatInput, SendChatResponse } from "@/types/ai";

export function useConversations() {
  const { isAuthenticated } = useSession();
  return useQuery<ConversationsPage>({
    queryKey: queryKeys.ai.conversations,
    queryFn: () => aiService.conversations(1),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

export function useConversation(id: number | null) {
  const { isAuthenticated } = useSession();
  return useQuery<ConversationDetail>({
    queryKey: queryKeys.ai.conversation(id ?? "none"),
    queryFn: () => aiService.conversation(id as number),
    enabled: isAuthenticated && id !== null,
    staleTime: 60_000,
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => aiService.deleteConversation(id),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: queryKeys.ai.conversation(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.ai.conversations });
    },
  });
}

export interface PendingTurn {
  input: SendChatInput;
  /** Local id of the optimistic user bubble. */
  localId: string;
  status: "sending" | "timeout" | "error";
  error?: string;
}

/**
 * Sends one assistant turn with a 30 s timeout. The user's message is appended optimistically to the
 * conversation cache; on success the assistant envelope is appended too (no refetch needed).
 */
export function useSendMessage(onConversationCreated?: (id: number) => void) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const mutation = useMutation<SendChatResponse, unknown, SendChatInput>({
    mutationFn: async (input) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const timer = setTimeout(() => ctrl.abort(new ApiError(0, "timeout")), CHAT_TIMEOUT_MS);
      try {
        return await aiService.send(input, ctrl.signal);
      } finally {
        clearTimeout(timer);
        abortRef.current = null;
      }
    },
  });

  const appendToCache = useCallback(
    (conversationId: number, msgs: ChatMessage[]) => {
      qc.setQueryData<ConversationDetail>(queryKeys.ai.conversation(conversationId), (prev) => {
        if (!prev) return prev;
        return { ...prev, messages: [...prev.messages, ...msgs] };
      });
    },
    [qc],
  );

  const send = useCallback(
    async (input: SendChatInput) => {
      const localId = `local-${Date.now()}`;
      setPending({ input, localId, status: "sending" });
      try {
        const res = await mutation.mutateAsync(input);
        const isNew = !input.conversationId;
        const now = new Date().toISOString();
        const userMsg: ChatMessage = {
          id: localId,
          role: "user",
          content: [
            ...(input.imageUrl ? [{ type: "image" as const, url: input.imageUrl }] : []),
            ...(input.message ? [{ type: "text" as const, text: input.message }] : []),
          ],
          createdAt: now,
        };
        const assistantMsg: ChatMessage = { id: `${localId}-reply`, role: "assistant", content: res.reply, createdAt: now };
        if (isNew) {
          qc.setQueryData<ConversationDetail>(queryKeys.ai.conversation(res.conversationId), {
            conversation: {
              id: res.conversationId,
              userId: 0,
              petId: res.petId,
              title: input.message.slice(0, 60),
              createdAt: now,
              updatedAt: now,
            },
            messages: [userMsg, assistantMsg],
          });
          onConversationCreated?.(res.conversationId);
        } else {
          appendToCache(res.conversationId, [userMsg, assistantMsg]);
        }
        void qc.invalidateQueries({ queryKey: queryKeys.ai.conversations });
        setPending(null);
        return res;
      } catch (err) {
        const aborted = err instanceof DOMException || (err instanceof ApiError && err.status === 0 && /abort|timeout/i.test(err.message));
        setPending({
          input,
          localId,
          status: aborted ? "timeout" : "error",
          error: aborted ? "The assistant took too long to answer." : err instanceof Error ? err.message : "Something went wrong",
        });
        throw err;
      }
    },
    [mutation, qc, appendToCache, onConversationCreated],
  );

  const retry = useCallback(() => {
    if (!pending) return Promise.resolve(null);
    return send(pending.input).catch(() => null);
  }, [pending, send]);

  const dismiss = useCallback(() => setPending(null), []);

  return { send, retry, dismiss, pending, isSending: mutation.isPending };
}
