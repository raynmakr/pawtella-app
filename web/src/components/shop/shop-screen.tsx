"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { LightbulbIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { Reveal } from "@/components/motion";
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

const QUESTION_START = /^(what|which|whats|what's|best|good|any|need|looking|recommend|suggest|how|is|are|do|does|can|should|for my|something)\b/i;

/**
 * Plain-English requests get assistant suggestions on top of the normal search:
 * a question mark, a question/need opener, or four or more words.
 */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (t.endsWith("?")) return true;
  if (QUESTION_START.test(t)) return true;
  return t.split(/\s+/).length >= 4;
}

export function ShopScreen() {
  const params = useSearchParams();
  const { primaryPet } = useSession();
  const [collection, setCollection] = useState(params.get("collection") ?? "");
  const [input, setInput] = useState(params.get("q") ?? "");
  const [assist, setAssist] = useState<ShopAssistResponse | null>(null);
  const q = useDebounced(input.trim(), 350);
  // Questions wait a little longer so we don't call the assistant on every pause in typing.
  const settled = useDebounced(input.trim(), 900);
  const latestQuestion = useRef("");
  const [activeQuestion, setActiveQuestion] = useState("");

  // Keep the URL shareable without re-rendering through the router on every keystroke.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (collection) sp.set("collection", collection);
    if (q) sp.set("q", q);
    const next = sp.toString();
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current) window.history.replaceState(null, "", next ? `/shop?${next}` : "/shop");
  }, [collection, q]);

  const collections = useCollections();
  const products = useProducts({ collection: collection || undefined, q: q || undefined }, true);
  const items = useMemo(() => products.data?.pages.flatMap((p) => p.products) ?? [], [products.data]);

  const ask = useMutation({
    mutationFn: (message: string) => shopService.assist(message, primaryPet?.id),
    // Ignore a late answer to a question the shopper has since changed.
    onSuccess: (data, message) => {
      if (message === latestQuestion.current) setAssist(data);
    },
  });

  const askAbout = (message: string) => {
    if (!message || message === latestQuestion.current) return;
    latestQuestion.current = message;
    setActiveQuestion(message);
    setAssist(null);
    ask.mutate(message);
  };

  // Suggestions follow the text: ask once it reads like a question, drop them when it doesn't.
  useEffect(() => {
    if (looksLikeQuestion(settled)) {
      askAbout(settled);
    } else if (latestQuestion.current) {
      latestQuestion.current = "";
      setActiveQuestion("");
      setAssist(null);
      ask.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  const clearSearch = () => {
    setInput("");
    latestQuestion.current = "";
    setActiveQuestion("");
    setAssist(null);
    ask.reset();
  };

  const showAssist = Boolean(activeQuestion) && Boolean(assist || ask.isPending || ask.isError);
  const petName = primaryPet?.name ?? "your pet";

  return (
    <>
      <PageHeader
        eyebrow="Supplies"
        title="Shop"
        description="Food, toys and treats for cats and dogs. Earn 1 Paw Point per $1."
        actions={<CartButton />}
      />
      <FulfillmentBanner className="mb-5" />

      {/* Search: products as you type; a plain-English request also gets suggestions. */}
      <form
        className="mb-4"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const text = input.trim();
          if (looksLikeQuestion(text)) askAbout(text);
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <label className="relative block">
          <span className="sr-only">Search products or describe what you need</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            enterKeyHint="search"
            placeholder={`Search, or describe what ${petName} needs`}
            className="h-12 w-full rounded-full bg-card pr-11 pl-11 text-base ring-1 ring-border transition outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring md:text-[15px] [&::-webkit-search-cancel-button]:appearance-none"
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
      </form>

      {/* Suggestions */}
      {showAssist && (
        <section className="mb-6 rounded-card bg-accent/60 p-4 ring-1 ring-border sm:p-5" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-points-foreground ring-1 ring-border dark:text-points">
              <LightbulbIcon className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Suggestions for you</p>
              {ask.isPending ? (
                <div className="mt-2 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : ask.isError ? (
                <ErrorState
                  className="py-6"
                  title="Couldn't load suggestions"
                  error={ask.error}
                  onRetry={() => {
                    const again = latestQuestion.current;
                    latestQuestion.current = "";
                    askAbout(again);
                  }}
                />
              ) : (
                <p className="mt-1 text-[15px] leading-relaxed">{assist?.reply}</p>
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
          {assist?.query && assist.query.toLowerCase() !== input.trim().toLowerCase() && (
            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={() => setInput(assist.query)}>
                Browse all “{assist.query}”
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
      {products.isLoading ? (
        <ListSkeleton variant="tile" rows={8} className="lg:grid-cols-4" />
      ) : products.isError ? (
        <ErrorState title="Couldn't load products" error={products.error} onRetry={() => void products.refetch()} retrying={products.isRefetching} />
      ) : items.length === 0 ? (
        showAssist ? null : (
        <EmptyState
          icon={<SearchIcon />}
          title={q ? `Nothing matches “${q}”` : "No products here yet"}
          description={
            q ? `Try a different word, pick a collection, or describe what ${petName} needs, like “soft food for a senior cat”.` : "Check back soon or browse another collection."
          }
          action={
            q ? (
              <Button variant="outline" onClick={clearSearch}>
                Clear search
              </Button>
            ) : undefined
          }
        />
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 8) * 0.04} className="h-full">
                <ProductCard product={p} className="h-full" />
              </Reveal>
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
