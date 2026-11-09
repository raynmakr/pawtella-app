/** Types for the AI area: assistant chat (api/ai/chat.js), presets, generations (lib/generations.js). */

export type VetAlertLevel = "emergency" | "soon";

export interface VetAlert {
  level: VetAlertLevel;
  reason: string;
}

export interface ProductSuggestion {
  handle: string;
  title: string;
  reason: string;
}

export interface PetProfileUpdates {
  weightKg?: number | null;
  birthday?: string | null;
  allergies?: string | null;
}

/** Mirrors lib/ai-assistant.js findPartners() output. */
export interface PartnerResult {
  id: number;
  name: string;
  type: string;
  city: string | null;
  distanceKm: number | null;
  rating: number | null;
  phone: string | null;
  website: string | null;
}

/** The assistant reply envelope (lib/ai-assistant.js). */
export interface ReplyEnvelope {
  text: string;
  vetAlert?: VetAlert | null;
  productSuggestions?: ProductSuggestion[];
  petProfileUpdates?: PetProfileUpdates | null;
  partnerResults?: PartnerResult[];
}

export type UserContentBlock = { type: "text"; text: string } | { type: "image"; url: string };

/** GET /api/ai/chat/:id messages[] (toApiMessage). */
export interface ChatMessage {
  id: number | string;
  conversationId?: number;
  role: "user" | "assistant" | "system";
  content: UserContentBlock[] | ReplyEnvelope;
  createdAt: string;
  /** Client-only: message is in flight / failed. */
  pending?: boolean;
  failed?: boolean;
}

/** GET /api/ai/chat conversations[] (camelized ai_conversations + pet_name + last_text). */
export interface Conversation {
  id: number;
  userId: number;
  petId: number | null;
  petName?: string | null;
  title: string | null;
  lastText?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationsPage {
  conversations: Conversation[];
  page: number;
  hasMore: boolean;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: ChatMessage[];
}

export interface ChatLocation {
  lat: number;
  lng: number;
  label?: string;
}

export interface SendChatInput {
  conversationId?: number | null;
  petId?: number | null;
  message: string;
  imageUrl?: string | null;
  location?: ChatLocation | null;
}

export interface SendChatResponse {
  conversationId: number;
  petId: number | null;
  reply: ReplyEnvelope;
}

/* ---------------------------------------- Presets ---------------------------------------- */

export type GenerationKind = "image" | "video";
export type PresetCategory = "seasonal" | "fun" | "portrait" | "challenge";

/** GET /api/ai/presets presets[] (lib/ai-presets.js + cost + example). */
export interface Preset {
  id: string;
  title: string;
  emoji: string;
  kind: GenerationKind | "both";
  category: PresetCategory;
  aspectRatio: string;
  suggestedDuration: number;
  prompt: string;
  cost: number;
  example: string;
}

export interface GenerationPrices {
  image: number;
  video: Record<string, number>;
  hdMultiplier: number;
  allowedDurations?: number[];
}

export interface PresetsResponse {
  presets: Preset[];
  categories: PresetCategory[];
  prices: GenerationPrices;
}

/* -------------------------------------- Generations -------------------------------------- */

export type GenerationStatus = "queued" | "running" | "done" | "failed";

/** Mirrors lib/generations.js toApiGeneration() (camelized ai_generations row minus providerOutputUrl). */
export interface Generation {
  id: number;
  userId: number;
  petId: number | null;
  kind: GenerationKind;
  provider: string;
  model: string;
  prompt: string;
  presetId: string | null;
  sourceImageUrl: string | null;
  durationSeconds: number | null;
  resolution: string | null;
  aspectRatio: string | null;
  hd: boolean;
  status: GenerationStatus;
  progress: number;
  providerRequestId: string | null;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  watermarkedUrl: string | null;
  pointsCharged: number;
  pointsRefunded: number;
  costUsdTicks: number | string | null;
  error: string | null;
  challengeId: number | null;
  postId: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface GenerationsPage {
  generations: Generation[];
  page: number;
  hasMore: boolean;
  prices: GenerationPrices;
}

export interface GenerateInput {
  kind: GenerationKind;
  prompt?: string;
  presetId?: string | null;
  petId?: number | null;
  sourceImageUrl?: string | null;
  duration?: number;
  hd?: boolean;
  aspectRatio?: string;
  challengeId?: number | null;
}

/** Minimal post shape returned by POST /api/ai/generate/:id/post (lib/posts.js serializePost). */
export interface GeneratedPost {
  id: number;
  caption: string | null;
  mediaUrl: string;
  mediaType: GenerationKind;
  challengeId: number | null;
  shareCount: number;
}

export interface PostGenerationResponse {
  post: GeneratedPost;
  generation: Generation;
  alreadyPosted?: boolean;
}

export interface CaptionResponse {
  captions: string[];
}

/** POST /api/posts/:id/share */
export interface ShareResponse {
  shareUrl: string;
  watermarkedUrl: string;
  shareCount: number;
}
