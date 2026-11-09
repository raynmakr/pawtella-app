"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeftIcon, Loader2Icon, ShoppingCartIcon, ZapIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { PawIcon } from "@/components/logo";
import { useProduct } from "@/hooks/use-shop";
import { addToCart } from "@/services/cart";
import { errorMessage, isApiError } from "@/lib/api";
import { formatPoints } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CartButton } from "./cart-button";
import { FulfillmentOptions } from "./fulfillment";
import { PawPackBadge } from "./paw-pack-badge";
import { Price } from "./price";
import { ProductImage } from "./product-image";
import { QuantityStepper } from "./quantity-stepper";
import { ReviewsSection } from "./reviews-section";
import { Stars } from "./stars";
import { StockBadge, resolveStock } from "./stock-badge";

export function ProductScreen({ handle }: { handle: string }) {
  const router = useRouter();
  const q = useProduct(handle);
  const product = q.data?.product;
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);

  const variant = useMemo(() => {
    if (!product) return null;
    return product.variants.find((v) => v.id === variantId) ?? product.variants.find((v) => v.availableForSale) ?? product.variants[0] ?? null;
  }, [product, variantId]);

  const add = useMutation({
    mutationFn: () => addToCart({ variantId: variant!.id, quantity }),
    onSuccess: () => {
      toast.success(`${product?.title} added to cart`, { action: { label: "View cart", onClick: () => router.push("/cart") } });
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't add to cart")),
  });

  if (q.isLoading) return <ProductSkeleton />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <EmptyState
          title="We couldn't find that product"
          description="It may have sold out for good or moved collections."
          action={
            <Button nativeButton={false} render={<Link href="/shop" />}>
              Back to shop
            </Button>
          }
        />
      );
    }
    return <ErrorState title="Couldn't load this product" error={q.error} onRetry={() => void q.refetch()} retrying={q.isRefetching} />;
  }
  if (!product || !variant) return null;

  const stock = resolveStock(product, product.stock);
  const soldOut = stock.state === "sold_out" || !variant.availableForSale;
  const priceCents = variant.priceCents ?? product.priceCents;
  const earn = product.pawPointsPack ? 0 : Math.floor((priceCents * quantity) / 100);
  const image = product.images[imageIndex] ?? product.images[0];
  const maxQty = Math.max(1, Math.min(99, variant.quantityAvailable && variant.quantityAvailable > 0 && variant.quantityAvailable < 9999 ? variant.quantityAvailable : 99));

  return (
    <>
      <nav className="mb-4 flex items-center justify-between gap-3" aria-label="Breadcrumb">
        <Link href="/shop" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon className="size-4" /> Shop
        </Link>
        <CartButton />
      </nav>

      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        {/* Gallery */}
        <div>
          <div className="relative aspect-square overflow-hidden rounded-card bg-muted ring-1 ring-border">
            <ProductImage src={image?.url} alt={image?.alt ?? product.title} priority sizes="(min-width: 768px) 50vw, 100vw" />
            <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
              {product.pawPointsPack ? <PawPackBadge points={product.pawPointsPack} size="md" /> : null}
              {product.compareAtPriceCents && product.compareAtPriceCents > priceCents ? (
                <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">Sale</span>
              ) : null}
            </div>
          </div>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {product.images.map((img, i) => (
                <button
                  key={img.url + i}
                  type="button"
                  onClick={() => setImageIndex(i)}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === imageIndex}
                  className={cn(
                    "relative size-16 shrink-0 overflow-hidden rounded-xl ring-2 transition",
                    i === imageIndex ? "ring-primary" : "ring-transparent hover:ring-border",
                  )}
                >
                  <ProductImage src={img.url} sizes="64px" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">{product.vendor}</p>
            <h1 className="mt-1 text-2xl text-balance sm:text-3xl">{product.title}</h1>
            {product.reviews.count > 0 && (
              <a href="#reviews-heading" className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <Stars value={product.reviews.avg} />
                <span className="font-semibold text-foreground">{product.reviews.avg.toFixed(1)}</span>({product.reviews.count})
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Price cents={priceCents} compareAtCents={product.compareAtPriceCents} currency={product.currency} size="lg" />
            <StockBadge stock={stock} size="md" />
          </div>
          {stock.state === "special_order" && (
            <p className="text-sm text-muted-foreground">Special order: we bring it in for you. Estimated {stock.leadDays ?? 7} days to the depot or your door.</p>
          )}

          {product.variants.length > 1 && (
            <div className="grid gap-1.5">
              <label className="text-sm font-semibold" htmlFor="variant">
                Option
              </label>
              <Select value={variant.id} onValueChange={(v) => setVariantId(v as string)}>
                <SelectTrigger id="variant" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {product.variants.map((v) => (
                    <SelectItem key={v.id} value={v.id} disabled={!v.availableForSale}>
                      {v.title}
                      {!v.availableForSale ? " · sold out" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <QuantityStepper value={quantity} onChange={setQuantity} max={maxQty} disabled={soldOut || add.isPending} />
            <Button size="lg" className="h-11 flex-1 min-w-40" onClick={() => add.mutate()} disabled={soldOut || add.isPending}>
              {add.isPending ? <Loader2Icon className="animate-spin" /> : soldOut ? "Sold out" : <><ShoppingCartIcon data-icon="inline-start" /> Add to cart</>}
            </Button>
          </div>

          {product.pawPointsPack ? (
            <div className="flex items-start gap-3 rounded-2xl bg-points/15 p-3.5 text-sm">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-points text-points-foreground">
                <ZapIcon className="size-4.5" />
              </span>
              <div>
                <p className="font-semibold">{formatPoints(product.pawPointsPack * quantity)} Paw Points, added right after payment</p>
                <p className="mt-0.5 text-muted-foreground">Digital pack, nothing to ship. Spend them in the AI Studio or at checkout (1 PP = $0.05).</p>
              </div>
            </div>
          ) : (
            earn > 0 && (
              <div className="flex items-center gap-3 rounded-2xl bg-accent p-3.5 text-sm">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-points text-points-foreground">
                  <PawIcon className="size-4.5" />
                </span>
                <p>
                  Earn <span className="font-heading font-extrabold">{formatPoints(earn)} Paw Points</span> on this item
                  <span className="text-muted-foreground"> · 1 PP per $1</span>
                </p>
              </div>
            )
          )}

          {product.description && (
            <div>
              <h2 className="text-base">About</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{product.description}</p>
              {product.tags.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {product.tags
                    .filter((t) => !t.startsWith("paw-points:"))
                    .map((t) => (
                      <li key={t} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {t}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {!product.pawPointsPack && <FulfillmentOptions compact />}
        </div>
      </div>

      <ReviewsSection handle={product.handle} title={product.title} />
    </>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-10">
      <Skeleton className="aspect-square rounded-card" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-11 w-full rounded-full" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}
