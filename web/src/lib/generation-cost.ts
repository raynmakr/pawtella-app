import type { GenerationKind, GenerationPrices } from "@/types/ai";

/** Fallback when the rules payload has not loaded yet (mirrors lib/points-rules.js defaults). */
export const DEFAULT_PRICES: GenerationPrices = {
  image: 2,
  video: { "6": 8, "10": 12, "15": 16 },
  hdMultiplier: 2,
  allowedDurations: [6, 10, 15],
};

export function allowedDurations(prices: GenerationPrices | undefined): number[] {
  const p = prices ?? DEFAULT_PRICES;
  const list = p.allowedDurations?.length ? p.allowedDurations : Object.keys(p.video).map(Number);
  return [...list].sort((a, b) => a - b);
}

/** Snap a duration to the nearest allowed one (ties go longer), as lib/points-rules.js does. */
export function nearestDuration(duration: number | undefined, prices?: GenerationPrices): number {
  const list = allowedDurations(prices);
  if (!Number.isFinite(duration)) return list[1] ?? list[0];
  let best = list[0];
  for (const a of list) {
    const d = Math.abs(a - (duration as number));
    const bd = Math.abs(best - (duration as number));
    if (d < bd || (d === bd && a > best)) best = a;
  }
  return best;
}

/** Client-side replica of generationCost({ kind, duration, hd }) driven by the API's prices payload. */
export function generationCost(
  { kind, duration, hd = false }: { kind: GenerationKind; duration?: number; hd?: boolean },
  prices?: GenerationPrices,
): number {
  const p = prices ?? DEFAULT_PRICES;
  const base = kind === "image" ? p.image : p.video[String(nearestDuration(duration, p))] ?? DEFAULT_PRICES.video["6"];
  return hd ? base * p.hdMultiplier : base;
}
