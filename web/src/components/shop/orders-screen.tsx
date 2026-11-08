"use client";

import Link from "next/link";
import { ChevronRightIcon, PackageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { PawIcon } from "@/components/logo";
import { useOrders } from "@/hooks/use-orders";
import { formatCents, formatPoints } from "@/lib/format";
import type { Order } from "@/types/orders";
import { FulfillmentIcon, OrderStatusChip, orderLabel } from "./order-status";

function orderDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export function OrderRow({ order }: { order: Order }) {
  const digitalOnly = order.lineItems.length > 0 && order.lineItems.every((li) => li.pawPointsPack);
  const net = order.pointsEarned + order.packPointsGranted;
  return (
    <li>
      <Link
        href={`/orders/${order.id}`}
        className="flex items-center gap-3 rounded-card bg-card p-4 ring-1 ring-border transition hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-heading text-base font-extrabold">{orderLabel(order.orderNumber)}</span>
            <OrderStatusChip status={order.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {orderDate(order.placedAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
          </p>
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{order.lineItems.map((li) => li.title).join(", ")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <FulfillmentIcon type={digitalOnly ? null : order.fulfillmentType} />
            {net > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-points-foreground dark:text-points">
                <PawIcon className="size-3.5" /> +{formatPoints(net)} PP
              </span>
            )}
            {order.pointsRedeemed > 0 && <span className="text-xs font-semibold text-muted-foreground">−{formatPoints(order.pointsRedeemed)} PP redeemed</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-heading text-base font-extrabold tabular-nums">{formatCents(order.totalCents, order.currency)}</span>
          <ChevronRightIcon className="size-5 text-muted-foreground" />
        </div>
      </Link>
    </li>
  );
}

export function OrdersScreen() {
  const q = useOrders();
  return (
    <>
      <PageHeader eyebrow="Shop" title="Orders" description="Pickups, deliveries and the Paw Points you earned on each." />
      {q.isLoading ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load your orders" error={q.error} onRetry={() => void q.refetch()} retrying={q.isRefetching} />
      ) : !q.data || q.data.orders.length === 0 ? (
        <EmptyState
          icon={<PackageIcon />}
          title="No orders yet"
          description="Your first order earns a 10 Paw Point bonus on top of 1 PP per $1."
          action={
            <Button nativeButton={false} render={<Link href="/shop" />}>
              Shop now
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {q.data.orders.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </ul>
      )}
    </>
  );
}
