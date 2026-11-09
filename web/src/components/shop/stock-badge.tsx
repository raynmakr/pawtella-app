import { CheckCircle2Icon, ClockIcon, XCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product, StockState, StockStateName } from "@/types/shop";

export interface ResolvedStock {
  state: StockStateName;
  label: string;
  leadDays?: number | null;
  qty?: number | null;
}

/**
 * Combine the inventory stock state with the Storefront availability. When the inventory layer does
 * not know the product (`unknown`), fall back to the variant's availableForSale / tags.
 */
export function resolveStock(product: Pick<Product, "availableForSale" | "tags" | "variants" | "pawPointsPack">, stock?: StockState | null): ResolvedStock {
  if (product.pawPointsPack) return { state: "in_stock", label: "Digital · instant delivery" };
  const s = stock?.state ?? "unknown";
  if (s === "in_stock") return { state: s, label: "In stock · pickup today", qty: stock?.qty };
  if (s === "low") {
    const qty = stock?.qty ?? null;
    return { state: s, label: qty ? `Only ${qty} left · pickup today` : "Low stock · pickup today", qty };
  }
  if (s === "special_order") {
    const lead = stock?.leadDays ?? 7;
    return { state: s, label: `Ships in ${lead} days`, leadDays: lead };
  }
  if (s === "sold_out") return { state: s, label: "Sold out" };
  // unknown → Storefront availability
  const qty = product.variants.reduce((sum, v) => sum + (v.quantityAvailable ?? 0), 0);
  if (product.tags.includes("special-order") && qty <= 0 && product.availableForSale) return { state: "special_order", label: "Ships in 7 days", leadDays: 7 };
  if (product.availableForSale && qty > 0 && qty <= 3) return { state: "low", label: `Only ${qty} left · pickup today`, qty };
  if (product.availableForSale) return { state: "in_stock", label: "In stock · pickup today", qty };
  return { state: "sold_out", label: "Sold out" };
}

export function StockBadge({ stock, className, size = "sm" }: { stock: ResolvedStock; className?: string; size?: "sm" | "md" }) {
  const tone =
    stock.state === "sold_out"
      ? "bg-muted text-muted-foreground"
      : stock.state === "special_order"
        ? "bg-accent text-points-foreground dark:text-points"
        : stock.state === "low"
          ? "bg-accent text-points-foreground dark:text-points"
          : "bg-teal-soft text-secondary";
  const Icon = stock.state === "sold_out" ? XCircleIcon : stock.state === "special_order" ? ClockIcon : CheckCircle2Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        tone,
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} />
      {stock.label}
    </span>
  );
}
