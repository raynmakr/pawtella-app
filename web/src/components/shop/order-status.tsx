import { PackageCheckIcon, PackageIcon, StoreIcon, TruckIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FulfillmentType, OrderStatus } from "@/types/orders";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  paid: "Paid",
  processing: "Preparing",
  ready_for_pickup: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  shipped: "Shipped",
  delivered: "Delivered",
  picked_up: "Picked up",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function statusTone(status: OrderStatus): string {
  switch (status) {
    case "ready_for_pickup":
    case "out_for_delivery":
    case "shipped":
      return "bg-accent text-points-foreground dark:text-points";
    case "delivered":
    case "picked_up":
      return "bg-success/15 text-success";
    case "cancelled":
    case "refunded":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-teal-soft text-secondary";
  }
}

export function OrderStatusChip({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold", statusTone(status), className)}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export const FULFILLMENT_META: Record<FulfillmentType, { label: string; Icon: LucideIcon }> = {
  pickup: { label: "Pickup", Icon: StoreIcon },
  local_delivery: { label: "Local delivery", Icon: TruckIcon },
  shipping: { label: "Shipping", Icon: PackageIcon },
};

export function FulfillmentIcon({ type, className }: { type: FulfillmentType | null; className?: string }) {
  const meta = type ? FULFILLMENT_META[type] : null;
  const Icon = meta?.Icon ?? PackageCheckIcon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground", className)} title={meta?.label ?? "Digital"}>
      <Icon className="size-4" />
      {meta?.label ?? "Digital"}
    </span>
  );
}

/** Steps of the status timeline for a fulfillment type. */
export function timelineFor(type: FulfillmentType | null, digitalOnly: boolean): OrderStatus[] {
  if (digitalOnly) return ["paid", "delivered"];
  if (type === "pickup") return ["paid", "processing", "ready_for_pickup", "picked_up"];
  if (type === "local_delivery") return ["paid", "processing", "out_for_delivery", "delivered"];
  return ["paid", "processing", "shipped", "delivered"];
}

/** Shopify sends `name` like "#1001" and the mock "#M835921"; show exactly one hash. */
export function orderLabel(orderNumber: number | string): string {
  return `#${String(orderNumber).replace(/^#+/, "")}`;
}
