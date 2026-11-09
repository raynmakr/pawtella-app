"use client";

import { RefreshCwIcon, ShoppingBagIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/format";
import type { SubscriptionOffer } from "@/types/shop";

/**
 * One-time vs Subscribe & Save selector for an eligible product.
 * `value` is null for a one-time purchase, or the chosen cadence's sellingPlanId.
 */
export function SubscribeOption({
  offer,
  value,
  onChange,
  unitPriceCents,
  currency,
}: {
  offer: SubscriptionOffer;
  value: string | null;
  onChange: (sellingPlanId: string | null) => void;
  unitPriceCents: number;
  currency: string;
}) {
  const subscribing = value !== null;
  const selected = offer.plans.find((p) => p.sellingPlanId === value) ?? offer.plans[0];
  const subPriceCents = Math.round((unitPriceCents * (100 - offer.basePercent)) / 100);

  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Purchase options">
      <button
        type="button"
        role="radio"
        aria-checked={!subscribing}
        onClick={() => onChange(null)}
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition",
          !subscribing ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/40",
        )}
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold">
          <ShoppingBagIcon className="size-4.5 text-muted-foreground" /> One-time purchase
        </span>
        <span className="text-sm font-semibold">{formatCents(unitPriceCents, currency)}</span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={subscribing}
        onClick={() => onChange(selected.sellingPlanId)}
        className={cn(
          "flex flex-col gap-1 rounded-2xl border p-3.5 text-left transition",
          subscribing ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/40",
        )}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5 text-sm font-semibold">
            <RefreshCwIcon className="size-4.5 text-primary" /> Subscribe &amp; save {offer.basePercent}–{offer.maxPercent}%
          </span>
          <span className="text-sm font-semibold">
            <span className="text-muted-foreground line-through mr-1.5">{formatCents(unitPriceCents, currency)}</span>
            {formatCents(subPriceCents, currency)}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          Auto-ship, skip or cancel anytime. Spend over {formatCents(offer.thresholdCents, currency)}/mo across your
          subscriptions to unlock {offer.maxPercent}% on all of them.
        </span>
      </button>

      {subscribing && (
        <div className="grid gap-1.5 pl-1">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="cadence">
            Delivery frequency
          </label>
          <Select value={selected.sellingPlanId} onValueChange={(v) => onChange(v as string)}>
            <SelectTrigger id="cadence" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {offer.plans.map((p) => (
                <SelectItem key={p.sellingPlanId} value={p.sellingPlanId}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
