"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon, Loader2Icon, ShoppingBagIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { checkoutHref, useCart } from "@/services/cart";
import { errorMessage } from "@/lib/api";
import { formatCents, formatPoints } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/stores/session";
import type { CartLine } from "@/types/shop";
import { FulfillmentOptions } from "./fulfillment";
import { PawPackBadge } from "./paw-pack-badge";
import { PawPointsCard } from "./paw-points-card";
import { ProductImage } from "./product-image";
import { QuantityStepper } from "./quantity-stepper";

export function CartScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { refresh } = useSession();
  const { cart, isLoading, isEmpty, error, refetch, updateQuantity, removeLine, applyCart, reset } = useCart();
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const hadLines = useRef(false);

  const refreshAfterCheckout = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.shop.orders }),
      qc.invalidateQueries({ queryKey: queryKeys.points.all }),
      refresh(),
    ]);
  };

  // Back from checkout with ?order=<id>: the order is placed, forget the cart.
  const orderParam = params.get("order");
  useEffect(() => {
    if (!orderParam) return;
    reset();
    void refreshAfterCheckout();
    toast.success("Order placed! Points land as soon as payment clears.", { action: { label: "View orders", onClick: () => router.push("/orders") } });
    router.replace("/cart");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderParam]);

  // Back from checkout via the browser: re-check the cart and refresh orders/points on focus.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      void refetch();
      void refreshAfterCheckout();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The mock checkout empties the cart once the order is paid: if we had lines and now have none,
  // the order went through.
  useEffect(() => {
    if (cart && cart.lines.length > 0) hadLines.current = true;
    else if (cart && cart.lines.length === 0 && hadLines.current) {
      hadLines.current = false;
      void refreshAfterCheckout();
      toast.success("Order placed! Points land as soon as payment clears.", { action: { label: "View orders", onClick: () => router.push("/orders") } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

  const setQty = async (line: CartLine, qty: number) => {
    setBusyLine(line.id);
    try {
      if (qty <= 0) await removeLine(line.id);
      else await updateQuantity(line.id, qty);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update your cart"));
    } finally {
      setBusyLine(null);
    }
  };

  const remove = async (line: CartLine) => {
    setBusyLine(line.id);
    try {
      await removeLine(line.id);
      toast.success(`${line.title} removed`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove that item"));
    } finally {
      setBusyLine(null);
    }
  };

  const href = checkoutHref(cart);
  const earn = cart ? Math.floor(cart.lines.filter((l) => !l.pawPointsPack).reduce((s, l) => s + l.priceCents * l.quantity, 0) / 100) : 0;
  const packPoints = cart ? cart.lines.reduce((s, l) => s + (l.pawPointsPack ?? 0) * l.quantity, 0) : 0;
  const hasPhysical = !!cart?.lines.some((l) => !l.pawPointsPack);

  return (
    <>
      <PageHeader
        eyebrow="Shop"
        title="Your cart"
        description={cart && cart.lines.length ? `${cart.totalQuantity ?? cart.lines.reduce((s, l) => s + l.quantity, 0)} item${(cart.totalQuantity ?? 0) === 1 ? "" : "s"}` : undefined}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/shop" />}>
            Keep shopping
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-card" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-card" />
        </div>
      ) : error ? (
        <ErrorState title="Couldn't load your cart" error={error} onRetry={() => void refetch()} />
      ) : isEmpty || !cart ? (
        <EmptyState
          icon={<ShoppingBagIcon />}
          title="Your cart is empty"
          description="Treats, toys and food for your best friend are a tap away. Every $1 earns a Paw Point."
          action={
            <Button size="lg" nativeButton={false} render={<Link href="/shop" />}>
              Browse the shop <ArrowRightIcon data-icon="inline-end" />
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
          {/* Lines */}
          <ul className="space-y-3">
            {cart.lines.map((line) => {
              const busy = busyLine === line.id;
              return (
                <li key={line.id} className="flex gap-3 rounded-card bg-card p-3 ring-1 ring-border sm:gap-4 sm:p-4">
                  <Link href={line.handle ? `/shop/${line.handle}` : "/shop"} className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted sm:size-24">
                    <ProductImage src={line.imageUrl} sizes="96px" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={line.handle ? `/shop/${line.handle}` : "/shop"} className="line-clamp-2 font-heading text-sm leading-snug font-bold hover:underline">
                          {line.title}
                        </Link>
                        {line.variantTitle && line.variantTitle !== "Default Title" && <p className="text-xs text-muted-foreground">{line.variantTitle}</p>}
                        {line.pawPointsPack ? <PawPackBadge points={line.pawPointsPack * line.quantity} className="mt-1" /> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void remove(line)}
                        disabled={busy}
                        aria-label={`Remove ${line.title}`}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {busy ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
                      </button>
                    </div>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                      <QuantityStepper size="sm" value={line.quantity} onChange={(q) => void setQty(line, q)} min={0} disabled={busy} />
                      <div className="text-right">
                        <p className="font-heading text-[15px] font-extrabold tabular-nums">{formatCents(line.lineTotalCents ?? line.priceCents * line.quantity, cart.currency)}</p>
                        {line.quantity > 1 && <p className="text-xs text-muted-foreground tabular-nums">{formatCents(line.priceCents, cart.currency)} each</p>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Summary column */}
          <div className="space-y-4 lg:sticky lg:top-6">
            <PawPointsCard cart={cart} onCart={applyCart} />

            <section className="rounded-card bg-card p-4 ring-1 ring-border sm:p-5" aria-label="Order summary">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatCents(cart.subtotalCents, cart.currency)}</dd>
                </div>
                {!!cart.discountCents && cart.discountCents > 0 && (
                  <div className="flex justify-between text-success">
                    <dt>Paw Points discount</dt>
                    <dd className="tabular-nums">−{formatCents(cart.discountCents, cart.currency)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <dt>Taxes &amp; delivery</dt>
                  <dd>Calculated at checkout</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-3 text-base">
                  <dt className="font-heading font-extrabold">Total</dt>
                  <dd className="font-heading font-extrabold tabular-nums">{formatCents(cart.totalCents, cart.currency)}</dd>
                </div>
              </dl>
              {(earn > 0 || packPoints > 0) && (
                <p className="mt-3 rounded-2xl bg-accent px-3 py-2 text-xs font-medium text-points-foreground dark:text-points">
                  {earn > 0 && (
                    <>
                      You&apos;ll earn <span className="font-bold">{formatPoints(earn)} PP</span> on this order
                    </>
                  )}
                  {earn > 0 && packPoints > 0 && " · "}
                  {packPoints > 0 && (
                    <>
                      <span className="font-bold">{formatPoints(packPoints)} PP</span> from packs, added right after payment
                    </>
                  )}
                </p>
              )}
              <Button size="lg" className="mt-4 h-12 w-full" nativeButton={false} disabled={!href} render={<a href={href ?? "#"} />}>
                Checkout <ArrowRightIcon data-icon="inline-end" />
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">Secure checkout by Shopify. Pickup, delivery or shipping is chosen there.</p>
            </section>

            {hasPhysical && <FulfillmentOptions footnote="You pick pickup, local delivery or shipping at checkout." />}
          </div>
        </div>
      )}
    </>
  );
}
