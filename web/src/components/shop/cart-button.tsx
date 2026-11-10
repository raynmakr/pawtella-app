"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ShoppingCartIcon } from "lucide-react";
import { useCart } from "@/services/cart";
import { cn } from "@/lib/utils";

/** Round cart button with the item count; the badge pops when an item is added. */
export function CartButton({ className }: { className?: string }) {
  const { count } = useCart();
  const prev = useRef(count);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    if (count > prev.current) setBump((b) => b + 1);
    prev.current = count;
  }, [count]);

  return (
    <Link
      href="/cart"
      aria-label={count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
      className={cn(
        "relative inline-flex h-11 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold ring-1 ring-border transition hover:bg-muted active:scale-[0.97]",
        className,
      )}
    >
      <ShoppingCartIcon className={cn("size-5 transition-transform", bump > 0 && "animate-pop")} />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && (
        <span
          key={bump}
          className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground",
            bump > 0 && "animate-pop",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
