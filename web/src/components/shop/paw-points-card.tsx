"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, Loader2Icon, TicketPercentIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { PawIcon } from "@/components/logo";
import { usePointsBalance } from "@/hooks/use-points";
import { cartService } from "@/services/cart";
import { errorMessage } from "@/lib/api";
import { formatCents, formatPoints } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/stores/session";
import { cn } from "@/lib/utils";
import type { Cart } from "@/types/shop";

const DEFAULT_RULES = { valueCents: 5, minRedeem: 20, maxRedeemPercent: 50 };
const HOLDS_KEY = [...queryKeys.points.all, "holds"] as const;

/** lib/points-rules.js maxRedeemablePoints */
export function maxRedeemable(subtotalCents: number, balance: number, rules = DEFAULT_RULES) {
  const byCart = Math.floor((subtotalCents * rules.maxRedeemPercent) / 100 / rules.valueCents);
  return Math.max(0, Math.min(byCart, Math.max(0, Math.trunc(balance))));
}

export function PawPointsCard({ cart, onCart }: { cart: Cart; onCart: (cart: Cart) => void }) {
  const qc = useQueryClient();
  const { refresh } = useSession();
  const points = usePointsBalance();
  const rules = { ...DEFAULT_RULES, ...(points.query.data?.rules ?? {}) };
  const holds = useQuery({ queryKey: HOLDS_KEY, queryFn: () => cartService.activeHolds(), staleTime: 10_000 });
  const activeHold = holds.data?.holds.find((h) => h.cartId === cart.id && h.status === "held") ?? null;

  // While a hold exists its points are already debited; the slider works against balance + held.
  const spendable = points.balance + (activeHold?.points ?? 0);
  const max = maxRedeemable(cart.subtotalCents, spendable, rules);
  const min = rules.minRedeem;
  // The raw choice is clamped into [min, max] on render, so cart changes never leave it out of range.
  const [chosen, setChosen] = useState(min);
  const value = Math.min(Math.max(chosen, min), Math.max(max, min));
  const setValue = (n: number) => setChosen(Math.round(n));

  const refreshAll = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: queryKeys.points.all }), refresh()]);
  };

  const apply = useMutation({
    mutationFn: (pts: number) => cartService.createHold(cart.id, pts),
    onSuccess: async (data) => {
      if (data.cart) onCart(data.cart);
      await refreshAll();
      toast.success(`${formatPoints(data.hold.points)} Paw Points applied: ${formatCents(data.hold.discountCents, cart.currency)} off`);
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't apply Paw Points")),
  });

  const remove = useMutation({
    mutationFn: (holdId: number) => cartService.releaseHold(holdId),
    onSuccess: async () => {
      await refreshAll();
      await qc.invalidateQueries({ queryKey: queryKeys.shop.cart(cart.id) });
      toast.success("Paw Points returned to your balance");
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't remove the discount")),
  });

  const discountPreview = value * rules.valueCents;
  const busy = apply.isPending || remove.isPending;

  if (points.isLoading || holds.isLoading) return <Skeleton className="h-40 w-full rounded-card" />;
  // Hide entirely when the balance can never reach the minimum.
  if (spendable < min) return null;

  const expires = activeHold ? new Date(activeHold.expiresAt) : null;

  return (
    <section className="rounded-card bg-card p-4 ring-1 ring-border sm:p-5" aria-labelledby="pp-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-points text-points-foreground">
            <PawIcon className="size-5" />
          </span>
          <div>
            <h3 id="pp-heading" className="text-base">
              Pay with Paw Points
            </h3>
            <p className="text-xs text-muted-foreground">
              Balance <span className="font-semibold text-foreground tabular-nums">{formatPoints(points.balance)} PP</span>
              {activeHold ? <span className="tabular-nums"> (+{formatPoints(activeHold.points)} reserved)</span> : null} · 1 PP = {formatCents(rules.valueCents)} · up to{" "}
              {rules.maxRedeemPercent}% of the subtotal
            </p>
          </div>
        </div>
      </div>

      {activeHold ? (
        <div className="mt-4 rounded-2xl bg-success/10 p-4 ring-1 ring-success/20">
          <div className="flex items-start gap-3">
            <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-success" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">
                {formatPoints(activeHold.points)} PP applied · {formatCents(activeHold.discountCents, cart.currency)} off
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <TicketPercentIcon className="size-3.5" />
                Code <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{activeHold.discountCode}</code> is on your cart
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Reserved for 24 hours{expires ? ` (until ${expires.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })})` : ""}. Points return to your balance
                if you don&apos;t check out in time.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove.mutate(activeHold.id)} disabled={busy}>
              {remove.isPending ? <Loader2Icon className="animate-spin" /> : "Remove"}
            </Button>
          </div>
        </div>
      ) : max < min ? (
        <p className="mt-4 rounded-2xl bg-muted p-3.5 text-sm text-muted-foreground">
          Add {formatCents(Math.ceil((min * rules.valueCents * 100) / rules.maxRedeemPercent) - cart.subtotalCents, cart.currency)} more to redeem the {min} PP minimum on this cart.
        </p>
      ) : (
        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <p className="font-heading text-2xl font-extrabold tabular-nums">
              {formatPoints(value)} <span className="text-sm font-bold text-muted-foreground">PP</span>
            </p>
            <p className="text-sm font-semibold text-success tabular-nums">−{formatCents(discountPreview, cart.currency)}</p>
          </div>
          <Slider
            className="mt-3"
            min={min}
            max={max}
            step={1}
            value={[value]}
            onValueChange={(v) => setValue(Array.isArray(v) ? v[0] : (v as number))}
            disabled={busy}
            aria-label="Paw Points to redeem"
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>{min} min</span>
            <span>{max} max</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {[50, 100].map((n) => (
              <QuickButton key={n} active={value === n} disabled={busy || n < min || n > max} onClick={() => setValue(n)}>
                {n}
              </QuickButton>
            ))}
            <QuickButton active={value === max} disabled={busy} onClick={() => setValue(max)}>
              Max
            </QuickButton>
            <Button variant="points" className="ml-auto" onClick={() => apply.mutate(value)} disabled={busy || value < min || value > max}>
              {apply.isPending ? <Loader2Icon className="animate-spin" /> : `Apply ${formatPoints(value)} PP`}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function QuickButton({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-8 rounded-full px-3 text-xs font-bold ring-1 transition disabled:opacity-40",
        active ? "bg-points text-points-foreground ring-points" : "bg-card text-foreground ring-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
