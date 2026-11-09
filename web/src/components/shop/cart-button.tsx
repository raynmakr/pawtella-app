"use client";

import Link from "next/link";
import { ShoppingCartIcon } from "lucide-react";
import { useCart } from "@/services/cart";
import { cn } from "@/lib/utils";

/** Round cart button with the item count; links to /cart. */
export function CartButton({ className }: { className?: string }) {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      aria-label={count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
      className={cn(
        "relative inline-flex h-11 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold ring-1 ring-border transition hover:bg-muted",
        className,
      )}
    >
      <ShoppingCartIcon className="size-5" />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
