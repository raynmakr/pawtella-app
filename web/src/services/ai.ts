import { api } from "@/lib/api";
import type {
  CaptionResponse,
  ConversationDetail,
  ConversationsPage,
  GenerateInput,
  Generation,
  GenerationsPage,
  PostGenerationResponse,
  PresetsResponse,
  SendChatInput,
  SendChatResponse,
  ShareResponse,
} from "@/types/ai";

/** Default timeout for an assistant turn; the UI offers a retry when it elapses. */
export const CHAT_TIMEOUT_MS = 30_000;

export const aiService = {
  /* ---- assistant chat ---- */
  conversations: (page = 1) => api<ConversationsPage>("/api/ai/chat", { query: { page } }),
  conversation: (id: number | string) => api<ConversationDetail>(`/api/ai/chat/${id}`),
  send: (input: SendChatInput, signal?: AbortSignal) =>
    api<SendChatResponse>("/api/ai/chat", { method: "POST", json: input, signal }),
  deleteConversation: (id: number | string) => api<{ ok: true }>(`/api/ai/chat/${id}`, { method: "DELETE" }),

  /* ---- studio ---- */
  presets: (params: { kind?: "image" | "video"; category?: string } = {}) =>
    api<PresetsResponse>("/api/ai/presets", { query: params }),
  generate: (input: GenerateInput) => api<Generation>("/api/ai/generate", { method: "POST", json: input }),
  generations: (page = 1, status?: string) => api<GenerationsPage>("/api/ai/generate", { query: { page, status } }),
  generation: (id: number | string) => api<Generation>(`/api/ai/generate/${id}`),
  postGeneration: (id: number | string, input: { caption?: string; featureConsent?: boolean; challengeId?: number | null }) =>
    api<PostGenerationResponse>(`/api/ai/generate/${id}/post`, { method: "POST", json: input }),
  captions: (input: { imageUrl: string; petName?: string; petId?: number; tone?: string }) =>
    api<CaptionResponse>("/api/ai/caption", { method: "POST", json: input }),

  /** POST /api/posts/:id/share (increments share_count; returns the referral share URL + watermarked media). */
  sharePost: (postId: number | string, channel?: string) =>
    api<ShareResponse>(`/api/posts/${postId}/share`, { method: "POST", json: { channel } }),
};
