/** Mirrors lib/shopify.js Product (+ mock-only extras) and api/shop.js additions. */
export interface ProductImage {
  url: string;
  alt?: string | null;
}

export interface ProductVariant {
  id: string;
  title: string;
  sku?: string | null;
  priceCents: number;
  availableForSale: boolean;
  quantityAvailable?: number | null;
}

export type StockStateName = "in_stock" | "low" | "special_order" | "sold_out" | "unknown";

/** lib/inventory/sync.js getStockState */
export interface StockState {
  state: StockStateName;
  qty?: number | null;
  leadDays?: number | null;
  sku?: string | null;
  policy?: string | null;
}

export interface Product {
  id: string;
  handle: string;
  title: string;
  description: string;
  vendor: string;
  tags: string[];
  images: ProductImage[];
  priceCents: number;
  compareAtPriceCents?: number | null;
  currency: string;
  variants: ProductVariant[];
  availableForSale: boolean;
  /** Set on Paw Point pack products (tag `paw-points:<n>`). */
  pawPointsPack?: number;
}

/** A Subscribe & Save cadence option for a product (lib/subscriptions/offer.js). */
export interface SubscriptionPlan {
  sellingPlanId: string;
  weeks: number;
  label: string;
  percent: number;
  priceCents: number;
}

/** The Subscribe & Save offer attached to an eligible product detail. Null/absent when ineligible. */
export interface SubscriptionOffer {
  eligible: true;
  category: "dry" | "wet" | "litter";
  basePercent: number;
  maxPercent: number;
  thresholdCents: number;
  plans: SubscriptionPlan[];
}

/** GET /api/shop/products/:handle adds stock + reviews summary. */
export interface ProductDetail extends Product {
  stock: StockState;
  reviews: { avg: number; count: number };
  /** Present only when SUBSCRIPTIONS_ENABLED and the product is eligible. */
  subscription?: SubscriptionOffer | null;
}

export interface ProductsPage {
  products: Product[];
  nextCursor: string | null;
  isMock?: boolean;
}

export interface Collection {
  id: string;
  handle: string;
  title: string;
  imageUrl?: string | null;
  productCount?: number;
}

export interface CartLine {
  id: string;
  quantity: number;
  merchandiseId: string;
  title: string;
  variantTitle?: string | null;
  imageUrl?: string | null;
  priceCents: number;
  /** Extras the mock (and our Storefront mapping) add. */
  handle?: string | null;
  sku?: string | null;
  lineTotalCents?: number;
  pawPointsPack?: number;
  productId?: string;
  /** Set when the line was added on a subscription selling plan. */
  sellingPlanId?: string | null;
  sellingPlanName?: string | null;
}

export interface Cart {
  id: string;
  checkoutUrl: string;
  lines: CartLine[];
  subtotalCents: number;
  totalCents: number;
  discountCents?: number;
  discountCodes: Array<{ code: string; applicable: boolean }>;
  currency: string;
  attributes?: Record<string, string>;
  buyerEmail?: string | null;
  totalQuantity?: number;
}

export interface FulfillmentInfo {
  depot: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    phone?: string;
    lat?: number;
    lng?: number;
    mapsUrl?: string;
  };
  hours: Array<{ days: string; open: string; close: string }>;
  pickup: { title: string; instructions: string; readyWithinText?: string };
  localDelivery: { title: string; radiusText: string; feeText?: string; windowText?: string; minOrderCents?: number };
  shipping: { title: string; text: string };
  notes?: string;
}

/** POST /api/ai/shop-assist */
export interface ShopAssistResponse {
  intent: "search" | "reorder" | "recommend" | "question" | "other";
  query: string;
  productHandles: string[];
  reply: string;
  products: Product[];
}

/** api/reviews.js toApiReview */
export interface Review {
  id: number;
  productHandle: string;
  rating: number;
  body: string | null;
  photoUrl: string | null;
  pointsAwarded: number;
  verifiedPurchase: boolean;
  createdAt: string;
  user: { id: number; handle: string; displayName: string | null; avatarUrl: string | null };
  pet: { id: number; name: string; species: string | null; photoUrl: string | null } | null;
}

export interface ReviewsResponse {
  reviews: Review[];
  summary: { avg: number; count: number; histogram: Record<"1" | "2" | "3" | "4" | "5", number> };
  page: number;
  limit: number;
}

export interface CreateReviewInput {
  productHandle: string;
  orderId?: number;
  rating: number;
  body?: string;
  photoUrl?: string;
  petId?: number;
}

/** POST /api/points/hold */
export interface PointsHold {
  id: number;
  userId: number;
  cartId: string;
  points: number;
  discountCents: number;
  currency?: string;
  discountCode: string;
  status: "held" | "captured" | "released" | "expired";
  expiresAt: string;
  createdAt: string;
}

export interface HoldResponse {
  hold: PointsHold;
  cart: Cart | null;
  balance: number;
  maxRedeemable: number;
}
