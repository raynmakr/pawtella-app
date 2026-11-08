import { api } from "@/lib/api";
import type {
  AddReviewResponse,
  AttributeResponse,
  OwnerPartner,
  PartnerApplyInput,
  PartnerDetail,
  PartnerMeResponse,
  PartnersListResponse,
  PayoutResponse,
  RedeemResponse,
} from "@/types/partner";

export interface PartnerSearch {
  lat?: number | null;
  lng?: number | null;
  type?: string | null;
  q?: string | null;
}

export const partnersService = {
  list: (params: PartnerSearch = {}) =>
    api<PartnersListResponse>("/api/partners", {
      query: { lat: params.lat ?? undefined, lng: params.lng ?? undefined, type: params.type || undefined, q: params.q || undefined },
    }),
  get: (id: number | string) => api<{ partner: PartnerDetail }>(`/api/partners/${id}`),
  apply: (input: PartnerApplyInput) => api<{ partner: OwnerPartner }>("/api/partners/apply", { method: "POST", json: input }),
  /** 404 when the user never applied; otherwise the dashboard (approved) or the pending application. */
  me: () => api<PartnerMeResponse>("/api/partners/me"),
  redeem: (input: { type: "points" | "gift_card"; amountCents: number }) =>
    api<RedeemResponse>("/api/partners/me/redeem", { method: "POST", json: input }),
  payout: (input: { amountCents: number; method: string; details: string }) =>
    api<PayoutResponse>("/api/partners/me/payout", { method: "POST", json: input }),
  attribute: (code: string) => api<AttributeResponse>("/api/partners/attribute", { method: "POST", json: { code } }),
  addReview: (id: number | string, input: { rating: number; body?: string }) =>
    api<AddReviewResponse>(`/api/partners/${id}/reviews`, { method: "POST", json: input }),
};
