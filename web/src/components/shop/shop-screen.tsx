"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2Icon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { useCollections, useProducts } from "@/hooks/use-shop";
import { shopService } from "@/services/shop";
import { useSession } from "@/stores/session";
import { cn } from "@/lib/utils";
import type { ShopAssistResponse } from "@/types/shop";
import { CartButton } from "./cart-button";
import { FulfillmentBanner } from "./fulfillment";
import { ProductCard } from "./product-card";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ShopScreen() {
  const params = useSearchParams();
  const { primaryPet } = useSession();
  const [collection, setCollection] = useState(params.get("collection") ?? "");
  const [input, setInput] = useState(params.get("q") ?? "");
  const [aiMode, setAiMode] = useState(params.get("ai") === "1");
  const [assist, setAssist] = useState<ShopAssistResponse | null>(null);
  const debounced = useDebounced(input.trim(), 350);
  const q = aiMode ? "" : debounced;

  // Keep the URL shareable without re-rendering through the router on every keystroke.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (collection) sp.set("collection", collection);
    if (q) sp.set("q", q);
    if (aiMode) sp.set("ai", "1");
    const next = sp.toString();
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current) window.history.replaceState(null, "", next ? `/shop?${next}` : "/shop");
  }, [collection, q, aiMode]);

  const collections = useCollections();
  const products = useProducts({ collection: collection || undefined, q: q || undefined }, !(aiMode && assist));
  const items = useMemo(() => products.data?.pages.flatMap((p) => p.products) ?? [], [products.data]);

  const ask = useMutation({
    mutationFn: (message: string) => shopService.assist(message, primaryPet?.id),
    onSuccess: (data) => setAssist(data),
  });

  const submitAsk = () => {
    const message = input.trim();
    if (!message || ask.isPending) return;
    ask.mutate(message);
  };

  const clearSearch = () => {
    setInput("");
    setAssist(null);
    ask.reset();
  };

  const toggleAi = () => {
    setAiMode((m) => !m);
    setAssist(null);
    ask.reset();
  };

  const showAssist = aiMode && (assist || ask.isPending || ask.isError);

  return (
    <>
      <PageHeader
        eyebrow="Supplies"
        title="Shop"
        description="Food, toys and treats for cats and dogs. Earn 1 Paw Point per $1."
        actions={<CartButton />}
      />
      <FulfillmentBanner className="mb-5" />

      {/* Search */}
      <form
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (aiMode) submitAsk();
        }}
      >
        <label className="relative flex-1">
          <span className="sr-only">{aiMode ? "Ask the shop assistant" : "Search products"}</span>
          {aiMode ? (
            <SparklesIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-primary" />
          ) : (
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
          )}
          <input
            type={aiMode ? "text" : "search"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            enterKeyHint={aiMode ? "send" : "search"}
            placeholder={aiMode ? `e.g. "grain-free food for ${primaryPet?.name ?? "my dog"}"` : "Search food, toys, litter…"}
            className={cn(
              "h-12 w-full rounded-full bg-card pr-11 pl-11 text-base ring-1 transition outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring md:text-[15px]",
              aiMode ? "ring-primary/40" : "ring-border",
            )}
          />
          {input && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={aiMode ? "default" : "outline"}
            size="lg"
            onClick={toggleAi}
            aria-pressed={aiMode}
            className="h-12 flex-1 sm:flex-none"
          >
            <SparklesIcon data-icon="inline-start" />
            Ask AI
          </Button>
          {aiMode && (
            <Button type="submit" size="lg" variant="secondary" className="h-12 flex-1 sm:flex-none" disabled={!input.trim() || ask.isPending}>
              {ask.isPending ? <Loader2Icon className="animate-spin" /> : "Ask"}
            </Button>
          )}
        </div>
      </form>

      {/* AI reply */}
      {showAssist && (
        <section className="mb-6 rounded-card bg-coral-soft/60 p-4 ring-1 ring-primary/15 sm:p-5" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <SparklesIcon className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              {ask.isPending ? (
                <div className="space-y-2 pt-1">
                  <Skeleton className="h-4 w-3/4 bg-primary/10" />
                  <Skeleton className="h-4 w-1/2 bg-primary/10" />
                </div>
              ) : ask.isError ? (
                <ErrorState className="py-6" title="The assistant is napping" error={ask.error} onRetry={submitAsk} />
              ) : (
                <p className="text-[15px] leading-relaxed">{assist?.reply}</p>
              )}
            </div>
          </div>
          {assist && assist.products.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {assist.products.map((p) => (
                <ProductCard key={p.handle} product={p} />
              ))}
            </div>
          )}
          {assist && (
            <div className="mt-4 flex flex-wrap gap-2">
              {assist.query && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAiMode(false);
                    setAssist(null);
                    setInput(assist.query);
                  }}
                >
                  Browse all matches for “{assist.query}”
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={clearSearch}>
                Ask something else
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Collections */}
      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2" role="tablist" aria-label="Collections">
          <Chip active={!collection} onClick={() => setCollection("")}>
            All
          </Chip>
          {collections.isLoading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)
            : collections.data?.collections.map((c) => (
                <Chip key={c.handle} active={collection === c.handle} onClick={() => setCollection(collection === c.handle ? "" : c.handle)}>
                  {c.title}
                  {typeof c.productCount === "number" && <span className="ml-1 text-[11px] opacity-70">{c.productCount}</span>}
                </Chip>
              ))}
        </div>
      </div>

      {/* Grid */}
      {aiMode && assist ? null : products.isLoading ? (
        <ListSkeleton variant="tile" rows={8} className="lg:grid-cols-4" />
      ) : products.isError ? (
        <ErrorState title="Couldn't load products" error={products.error} onRetry={() => void products.refetch()} retrying={products.isRefetching} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title={q ? `Nothing matches “${q}”` : "No products here yet"}
          description={q ? "Try a different word, pick a collection, or ask the AI for a recommendation." : "Check back soon or browse another collection."}
          action={
            q ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={clearSearch}>
                  Clear search
                </Button>
                <Button
                  onClick={() => {
                    setAiMode(true);
                    setAssist(null);
                  }}
                >
                  <SparklesIcon data-icon="inline-start" /> Ask AI
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {products.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" size="lg" onClick={() => void products.fetchNextPage()} disabled={products.isFetchingNextPage}>
                {products.isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap ring-1 transition",
        active ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-foreground/80 ring-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
