export type PartnerType = "vet" | "groomer" | "walker" | "trainer" | "sitter" | "boarding" | "rescue" | "boutique" | "other";
export type PartnerTier = "bronze" | "silver" | "gold";
export type PartnerStatus = "pending" | "approved" | "suspended" | "rejected";

export const PARTNER_TYPES: Array<{ value: PartnerType; label: string }> = [
  { value: "vet", label: "Vet" },
  { value: "groomer", label: "Groomer" },
  { value: "walker", label: "Walker" },
  { value: "trainer", label: "Trainer" },
  { value: "sitter", label: "Sitter" },
  { value: "boarding", label: "Boarding" },
  { value: "rescue", label: "Rescue" },
  { value: "boutique", label: "Boutique" },
  { value: "other", label: "Other" },
];

export function partnerTypeLabel(type: string | null | undefined): string {
  return PARTNER_TYPES.find((t) => t.value === type)?.label ?? "Partner";
}

/** lib/partners.js toPublicPartner(): the partners row minus private fields, camelised. */
export interface Partner {
  id: number;
  businessName: string;
  type: PartnerType;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string | null;
  website: string | null;
  bookingUrl: string | null;
  instagram: string | null;
  street1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  services: string[];
  status: PartnerStatus;
  tier: PartnerTier;
  isFeatured: boolean;
  code: string;
  discountCode: string | null;
  discountPercent: number;
  activeReferred90d: number;
  totalReferred: number;
  ratingAvg: number | null;
  ratingCount: number;
  appliedAt: string;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only when the search had lat/lng. */
  distanceKm?: number | null;
}

export interface PartnerReview {
  id: number;
  rating: number;
  body: string | null;
  createdAt: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PartnerDetail extends Partner {
  reviews: { average: number | null; count: number; recent: PartnerReview[] };
}

export interface PartnersListResponse {
  partners: Partner[];
  types: PartnerType[];
}

export interface PartnerApplyInput {
  businessName: string;
  type: PartnerType;
  description?: string;
  email?: string;
  phone?: string;
  website?: string;
  bookingUrl?: string;
  instagram?: string;
  street1?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
  services?: string[];
  logoUrl?: string;
  coverUrl?: string;
}

/** toOwnerPartner(): the full row (incl. email, ownerUserId) minus admin notes. */
export interface OwnerPartner extends Partner {
  ownerUserId: number | null;
  email: string | null;
  shopifyCustomerId?: string | null;
}

export interface TierRule {
  id: PartnerTier;
  minActive: number;
  discountPercent: number;
  featured: boolean;
  perks: string[];
}

export interface PartnerEarning {
  id: number;
  type: "commission" | "redeem_points" | "redeem_gift_card" | "payout" | "adjustment";
  amountCents: number;
  currency: string;
  status: "pending" | "available" | "paid" | "cancelled";
  availableAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  orderNumber: string | null;
}

export interface ReferredCustomer {
  handle: string;
  avatarUrl: string | null;
  source: string;
  attributedAt: string;
}

/** GET /api/partners/me for an approved partner (lib/partners.js getDashboard). */
export interface PartnerDashboard {
  partner: OwnerPartner;
  tier: {
    id: PartnerTier;
    discountPercent: number;
    featured: boolean;
    perks: string[];
    activeReferred: number;
    next: { id: PartnerTier; minActive: number; remaining: number; progress: number } | null;
  };
  earnings: {
    pendingCents: number;
    availableCents: number;
    paidCents: number;
    lifetimeCents: number;
    recent: PartnerEarning[];
  };
  referred: { total: number; active: number; current: number; orders: number; recent: ReferredCustomer[] };
  code: string;
  discountCode: string | null;
  links: { referral: string; qr: string; poster: string };
  rules: {
    commissionPercent: number;
    commissionMaturityDays: number;
    redeemPointsCentsPerPoint: number;
    minPayoutCents: number;
    payoutMethods: string[];
    tiers: TierRule[];
  };
}

/** GET /api/partners/me for a not-yet-approved partner. */
export interface PartnerPendingResponse {
  partner: OwnerPartner;
  status: Exclude<PartnerStatus, "approved">;
  rules: { tiers: TierRule[] };
}

export type PartnerMeResponse = PartnerDashboard | PartnerPendingResponse;

export function isDashboard(res: PartnerMeResponse): res is PartnerDashboard {
  return "earnings" in res;
}

export interface RedeemResponse {
  earning: PartnerEarning;
  points?: number;
  balanceAfter?: number;
  giftCard?: { code: string; lastCharacters: string; amountCents: number };
  availableCents: number;
}

export interface PayoutResponse {
  payout: PartnerEarning;
}

export interface AttributeResponse {
  attribution: { id: number; partnerId: number; expiresAt: string };
  partner: Partner;
  alreadyAttributed: boolean;
  bonusPoints: number;
}

export interface AddReviewResponse {
  review: { id: number; rating: number; body: string | null; createdAt: string };
  ratingAvg: number;
  ratingCount: number;
}
