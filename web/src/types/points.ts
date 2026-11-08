/** GET /api/points (owned by Web C; the shell only reads `balance`). */
export interface PointsSummary {
  balance: number;
  lifetimeEarned: number;
  held: number;
  rules?: {
    valueCents: number;
    minRedeem: number;
    maxRedeemPercent: number;
    prices?: Record<string, number>;
  };
  ways?: Array<{ id?: string; title: string; points: number; done?: boolean; description?: string }>;
}
