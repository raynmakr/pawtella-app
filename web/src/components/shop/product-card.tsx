"use client";

import Link from "next/link";
import { useState } from "react";
import { PlusIcon, Loader2Icon, CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/api";
import { addToCart } from "@/services/cart";
import type { Product, ProductDetail } from "@/types/shop";
import { PawPackBadge } from "./paw-pack-badge";
import { Price } from "./price";
import { ProductImage } from "./product-image";
import { StockBadge, resolveStock } from "./stock-badge";

/** The Storefront list endpoint has no stock info; the detail endpoint does. */
export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const stock = resolveStock(product, (product as Partial<ProductDetail>).stock ?? null);
  const variant = product.variants.find((v) => v.availableForSale) ?? product.variants[0];
  const canAdd = stock.state !== "sold_out" && !!variant;
  const image = product.images[0];

  const quickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canAdd || state === "busy") return;
    setState("busy");
    try {
      await addToCart({ variantId: variant.id, quantity: 1 });
      setState("done");
      toast.success(`${product.title} added to cart`, { action: { label: "View cart", onClick: () => router.push("/cart") } });
      setTimeout(() => setState("idle"), 1500);
    } catch (err) {
      setState("idle");
      toast.error(errorMessage(err, "Couldn't add to cart"));
    }
  };

  return (
    <Link
      href={`/shop/${product.handle}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-card bg-card ring-1 ring-border transition hover:shadow-soft hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        <ProductImage
          src={image?.url}
          alt={image?.alt ?? product.title}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="transition duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {product.pawPointsPack ? <PawPackBadge points={product.pawPointsPack} /> : null}
          {product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">Sale</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={quickAdd}
          disabled={!canAdd}
          aria-label={canAdd ? `Add ${product.title} to cart` : `${product.title} is sold out`}
          className={cn(
            "absolute right-2 bottom-2 flex size-10 items-center justify-center rounded-full shadow-lift ring-2 ring-background transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60",
            state === "done" ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {state === "busy" ? <Loader2Icon className="size-5 animate-spin" /> : state === "done" ? <CheckIcon className="size-5" strokeWidth={3} /> : <PlusIcon className="size-5" strokeWidth={2.75} />}
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="text-xs font-semibold text-muted-foreground">{product.vendor}</p>
        <h3 className="line-clamp-2 font-heading text-sm leading-snug font-bold">{product.title}</h3>
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <Price cents={product.priceCents} compareAtCents={product.compareAtPriceCents} currency={product.currency} />
          <StockBadge stock={stock} className="self-start" />
        </div>
      </div>
    </Link>
  );
}
