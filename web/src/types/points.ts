/** Paw Points types, mirroring api/points.js and lib/points-rules.js. */

export interface PointsPrices {
  image: number;
  video: Record<string, number>;
  hdMultiplier: number;
}

export interface PointsRules {
  valueCents: number;
  minRedeem: number;
  maxRedeemPercent: number;
  holdHours?: number;
  expiryMonths?: number | null;
  dailyGenerationCap?: number;
  earnPerDollarCents?: number;
  prices?: PointsPrices;
}

/** describeWays() entries. */
export interface PointsWay {
  id?: string;
  title: string;
  points: number;
  done?: boolean;
  repeatable?: boolean;
  description?: string;
}

/** RULES.packs entries (sold as Shopify products tagged paw-points:<n>). */
export interface PointsPack {
  sku: string;
  points: number;
  priceCents: number;
  handle: string;
}

/** GET /api/points (owned by Web C; the shell only reads `balance`). */
export interface PointsSummary {
  balance: number;
  lifetimeEarned: number;
  held: number;
  valueCents?: number;
  balanceCents?: number;
  rules?: PointsRules;
  ways?: PointsWay[];
  packs?: PointsPack[];
  lastActivityAt?: string | null;
}

export type PointTransactionType = "earn" | "bonus" | "purchase" | "refund" | "spend" | "hold" | "release" | "expire" | "admin";

/** GET /api/points/transactions rows (lib/points.js listTransactions). */
export interface PointTransaction {
  id: number;
  amount: number;
  type: PointTransactionType | string;
  source: string | null;
  refType: string | null;
  refId: number | null;
  balanceAfter: number;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TransactionsPage {
  transactions: PointTransaction[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface PacksResponse {
  packs: PointsPack[];
  valueCents: number;
}
