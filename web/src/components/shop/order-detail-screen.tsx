"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckIcon, ChevronLeftIcon, ExternalLinkIcon, MapPinIcon, PenLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PawIcon } from "@/components/logo";
import { useOrder } from "@/hooks/use-orders";
import { useFulfillment, useProductsByHandle } from "@/hooks/use-shop";
import { isApiError } from "@/lib/api";
import { formatCents, formatPoints } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Order, OrderLineItem, OrderStatus } from "@/types/orders";
import { FULFILLMENT_META, OrderStatusChip, STATUS_LABEL, orderLabel, timelineFor } from "./order-status";
import { PawPackBadge } from "./paw-pack-badge";
import { ProductImage } from "./product-image";
import { ReviewDialog } from "./review-dialog";

function Timeline({ order }: { order: Order }) {
  const digitalOnly = order.lineItems.length > 0 && order.lineItems.every((li) => li.pawPointsPack);
  const steps = timelineFor(order.fulfillmentType, digitalOnly);
  const terminal = order.status === "cancelled" || order.status === "refunded";
  // Digital-only orders are "delivered" the moment they are paid.
  const effective: OrderStatus = digitalOnly && order.status === "paid" ? "delivered" : order.status;
  const idx = steps.indexOf(effective);
  const reached = terminal ? -1 : idx === -1 ? 0 : idx;
  return (
    <ol className="flex items-start justify-between gap-1" aria-label="Order progress">
      {steps.map((s, i) => {
        const done = i <= reached;
        const current = i === reached;
        return (
          <li key={s} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : done ? "bg-primary" : "bg-border")} />
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full ring-2 ring-background",
                  done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  current && "shadow-[0_0_0_4px_var(--coral-soft)]",
                )}
              >
                {done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className={cn("h-0.5 flex-1", i === steps.length - 1 ? "bg-transparent" : i < reached ? "bg-primary" : "bg-border")} />
            </div>
            <span className={cn("mt-1.5 text-[11px] leading-tight font-semibold", done ? "text-foreground" : "text-muted-foreground")}>{STATUS_LABEL[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function LineItemRow({ item, order, imageUrl, onReview }: { item: OrderLineItem; order: Order; imageUrl?: string | null; onReview: (item: OrderLineItem) => void }) {
  const reviewed = !!item.handle && (order.reviewedHandles ?? []).includes(item.handle);
  const canReview = !!item.handle && !item.pawPointsPack;
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <Link href={item.handle ? `/shop/${item.handle}` : "/shop"} className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
        <ProductImage src={imageUrl} sizes="64px" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={item.handle ? `/shop/${item.handle}` : "/shop"} className="line-clamp-2 text-sm font-semibold hover:underline">
              {item.title}
            </Link>
            <p className="text-xs text-muted-foreground tabular-nums">
              ×{item.quantity} · {formatCents(item.priceCents, order.currency)} each
            </p>
            {item.pawPointsPack ? <PawPackBadge points={item.pawPointsPack * item.quantity} className="mt-1" /> : null}
          </div>
          <span className="shrink-0 text-sm font-bold tabular-nums">{formatCents(item.priceCents * item.quantity, order.currency)}</span>
        </div>
        {canReview && (
          <div className="mt-2">
            {reviewed ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                <CheckIcon className="size-3.5" /> Reviewed
              </span>
            ) : (
              <Button variant="soft" size="sm" onClick={() => onReview(item)}>
                <PenLineIcon data-icon="inline-start" /> Write a review
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function OrderDetailScreen({ id }: { id: string }) {
  const q = useOrder(id);
  const fulfillment = useFulfillment();
  const order = q.data?.order;
  const handles = (order?.lineItems ?? []).map((li) => li.handle).filter((h): h is string => !!h);
  const products = useProductsByHandle(handles);
  const [reviewing, setReviewing] = useState<OrderLineItem | null>(null);

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-48 w-full rounded-card" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    );
  }
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <EmptyState
          title="Order not found"
          description="It may belong to another account."
          action={
            <Button nativeButton={false} render={<Link href="/orders" />}>
              All orders
            </Button>
          }
        />
      );
    }
    return <ErrorState title="Couldn't load this order" error={q.error} onRetry={() => void q.refetch()} retrying={q.isRefetching} />;
  }
  if (!order) return null;

  const imageFor = (handle: string | null) => {
    if (!handle) return null;
    const i = handles.indexOf(handle);
    return products[i]?.data?.product.images[0]?.url ?? null;
  };
  const digitalOnly = order.lineItems.length > 0 && order.lineItems.every((li) => li.pawPointsPack);
  const meta = order.fulfillmentType ? FULFILLMENT_META[order.fulfillmentType] : null;
  const f = fulfillment.data?.fulfillment;
  const placed = new Date(order.placedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
  const totalPoints = order.pointsEarned + order.packPointsGranted;

  return (
    <>
      <nav className="mb-4" aria-label="Breadcrumb">
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon className="size-4" /> Orders
        </Link>
      </nav>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">Order</p>
          <h1 className="text-2xl sm:text-3xl">{orderLabel(order.orderNumber)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Placed {placed}</p>
        </div>
        <OrderStatusChip status={order.status} className="text-sm" />
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-4">
          <section className="rounded-card bg-card p-4 ring-1 ring-border sm:p-5">
            <Timeline order={order} />
            {(order.status === "cancelled" || order.status === "refunded") && (
              <p className="mt-4 rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">This order was {STATUS_LABEL[order.status].toLowerCase()}.</p>
            )}
          </section>

          <section className="rounded-card bg-card p-4 ring-1 ring-border sm:p-5">
            <h2 className="mb-2 text-base">Items</h2>
            <ul className="divide-y divide-border">
              {order.lineItems.map((li, i) => (
                <LineItemRow key={`${li.sku ?? li.handle ?? i}-${i}`} item={li} order={order} imageUrl={imageFor(li.handle)} onReview={setReviewing} />
              ))}
            </ul>
          </section>

          {/* Fulfillment instructions */}
          <section className="rounded-card bg-card p-4 ring-1 ring-border sm:p-5">
            <h2 className="mb-2 flex items-center gap-2 text-base">
              {meta && !digitalOnly ? (
                <>
                  <meta.Icon className="size-5 text-secondary" /> {meta.label}
                </>
              ) : (
                "Delivery"
              )}
            </h2>
            {digitalOnly ? (
              <p className="text-sm text-muted-foreground">Digital order. Your Paw Points were added right after payment, nothing to pick up.</p>
            ) : order.fulfillmentType === "pickup" ? (
              <div className="text-sm">
                {f ? (
                  <>
                    <p className="font-semibold">{f.depot.name}</p>
                    <p className="mt-0.5 inline-flex items-start gap-1 text-muted-foreground">
                      <MapPinIcon className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {f.depot.street1}
                        {f.depot.street2 ? `, ${f.depot.street2}` : ""}, {f.depot.city}, {f.depot.province} {f.depot.postalCode}
                        {f.depot.mapsUrl && (
                          <>
                            {" "}
                            ·{" "}
                            <a href={f.depot.mapsUrl} target="_blank" rel="noreferrer" className="text-secondary underline-offset-2 hover:underline">
                              Map
                            </a>
                          </>
                        )}
                      </span>
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {f.hours.map((h) => (
                        <li key={h.days}>
                          <span className="font-medium text-foreground">{h.days}</span> {h.close ? `${h.open}–${h.close}` : h.open}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 leading-relaxed text-muted-foreground">
                      {order.status === "ready_for_pickup"
                        ? "Your order is ready! Bring your order number and park in the loading zone out front."
                        : order.status === "picked_up"
                          ? "Picked up. Thanks for shopping local!"
                          : f.pickup.instructions}
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-16 w-full" />
                )}
              </div>
            ) : order.fulfillmentType === "local_delivery" ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{f?.localDelivery.windowText ?? "Delivered by our Toronto courier."} We text you when the driver is on the way.</p>
            ) : (
              <div className="text-sm text-muted-foreground">
                <p>{f?.shipping.text ?? "Shipped with Canada Post or UPS."}</p>
                {order.trackingUrl ? (
                  <Button variant="outline" size="sm" className="mt-3" nativeButton={false} render={<a href={order.trackingUrl} target="_blank" rel="noreferrer" />}>
                    Track package <ExternalLinkIcon data-icon="inline-end" />
                  </Button>
                ) : (
                  <p className="mt-2 text-xs">Tracking appears here once the label is printed.</p>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-card bg-card p-4 ring-1 ring-border sm:p-5" aria-label="Totals">
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={formatCents(order.subtotalCents, order.currency)} />
              {order.discountCents > 0 && <Row label="Discounts" value={`−${formatCents(order.discountCents, order.currency)}`} tone="success" />}
              <Row label={order.fulfillmentType === "pickup" ? "Pickup" : "Shipping"} value={order.shippingCents > 0 ? formatCents(order.shippingCents, order.currency) : "Free"} />
              <Row label="Tax" value={formatCents(order.taxCents, order.currency)} />
              <div className="flex justify-between border-t border-border pt-2 text-base">
                <dt className="font-heading font-extrabold">Total</dt>
                <dd className="font-heading font-extrabold tabular-nums">{formatCents(order.totalCents, order.currency)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-card bg-accent p-4 ring-1 ring-points/30 sm:p-5" aria-label="Paw Points">
            <h2 className="flex items-center gap-2 text-base">
              <span className="flex size-7 items-center justify-center rounded-lg bg-points text-points-foreground">
                <PawIcon className="size-4" />
              </span>
              Paw Points
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {order.pointsEarned > 0 && <Row label="Earned on this order" value={`+${formatPoints(order.pointsEarned)} PP`} />}
              {order.packPointsGranted > 0 && <Row label="From Paw Point packs" value={`+${formatPoints(order.packPointsGranted)} PP`} />}
              {order.pointsRedeemed > 0 && <Row label="Redeemed at checkout" value={`−${formatPoints(order.pointsRedeemed)} PP`} />}
              {totalPoints === 0 && order.pointsRedeemed === 0 && <p className="text-muted-foreground">Points are added once payment clears.</p>}
            </dl>
            <Link href="/points" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">
              See points history
            </Link>
          </section>
        </div>
      </div>

      {reviewing && reviewing.handle && (
        <ReviewDialog
          open={!!reviewing}
          onOpenChange={(o) => {
            if (!o) setReviewing(null);
          }}
          productHandle={reviewing.handle}
          productTitle={reviewing.title}
          orderId={order.id}
          onCreated={() => void q.refetch()}
        />
      )}
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className={cn("flex justify-between", tone === "success" && "text-success")}>
      <dt className={cn(tone ? "" : "text-muted-foreground")}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
