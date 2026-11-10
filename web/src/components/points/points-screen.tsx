"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  CircleIcon,
  GiftIcon,
  HistoryIcon,
  InfoIcon,
  LoaderCircleIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TrophyIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { PawIcon } from "@/components/logo";
import { Mascot } from "@/components/mascot";
import { useCountUp } from "@/hooks/use-count-up";
import { pointsService } from "@/services/points";
import { shopService } from "@/services/shop";
import { addToCart } from "@/services/cart";
import { errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatCents, formatPoints } from "@/lib/format";
import { useSession } from "@/stores/session";
import { cn } from "@/lib/utils";
import type { PointsPack, PointsSummary } from "@/types/points";

const DEFAULT_PACKS: PointsPack[] = [
  { sku: "PP-100", points: 100, priceCents: 499, handle: "paw-points-100" },
  { sku: "PP-300", points: 300, priceCents: 1425, handle: "paw-points-300" },
  { sku: "PP-1000", points: 1000, priceCents: 4500, handle: "paw-points-1000" },
];

function QuickAction({ href, icon: Icon, label, tone }: { href: string; icon: LucideIcon; label: string; tone: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-2 rounded-card bg-card p-3.5 text-center ring-1 ring-border transition hover:ring-primary/40">
      <span className={cn("flex size-11 items-center justify-center rounded-2xl", tone)}>
        <Icon className="size-5" />
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}

export function PointsScreen() {
  const { user, isAuthenticated } = useSession();
  const router = useRouter();
  const [buying, setBuying] = useState<string | null>(null);

  /** Add the pack's Shopify variant to the cart (Web D's cart service); fall back to the product page. */
  const buyPack = async (pack: PointsPack) => {
    setBuying(pack.sku);
    try {
      const { product } = await shopService.product(pack.handle);
      const variant = product.variants.find((v) => v.availableForSale) ?? product.variants[0];
      if (!variant) throw new Error("This pack isn't available right now");
      await addToCart({ variantId: variant.id, quantity: 1 });
      toast.success(`${formatPoints(pack.points)} Paw Points pack added to your cart`, {
        action: { label: "View cart", onClick: () => router.push("/cart") },
      });
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't add the pack"));
      router.push(`/shop/${pack.handle}`);
    } finally {
      setBuying(null);
    }
  };
  const q = useQuery<PointsSummary>({
    queryKey: queryKeys.points.summary,
    queryFn: () => pointsService.summary(),
    enabled: isAuthenticated,
    staleTime: 15_000,
  });
  const data = q.data;
  const balance = data?.balance ?? user?.pawPoints ?? 0;
  const valueCents = data?.valueCents ?? data?.rules?.valueCents ?? 5;
  const rules = data?.rules;
  const packs = data?.packs?.length ? data.packs : DEFAULT_PACKS;
  const ways = data?.ways ?? [];
  const doneWays = ways.filter((w) => w.done).length;
  const oneTime = ways.filter((w) => !w.repeatable);
  const displayBalance = useCountUp(balance);

  return (
    <>
      <PageHeader
        eyebrow="Rewards"
        title="Paw Points"
        description="Earn by posting, inviting friends and shopping. Spend in the Studio or at checkout."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/points/history" />}>
            <HistoryIcon data-icon="inline-start" /> History
          </Button>
        }
      />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-card bg-points p-6 text-points-foreground shadow-lift ring-1 ring-points/60 sm:p-8">
        <Mascot
          pose="wave"
          aria-hidden
          className="pointer-events-none absolute -right-3 -bottom-4 w-28 drop-shadow-[0_6px_14px_rgba(58,42,5,0.22)] sm:w-32"
        />
        <p className="text-xs font-bold tracking-wider uppercase opacity-80">Your balance</p>
        <div className="mt-1 flex items-end gap-3">
          {q.isLoading && !user ? (
            <Skeleton className="h-14 w-40 bg-points-foreground/20" />
          ) : (
            <p className="font-heading text-5xl font-extrabold tabular-nums sm:text-6xl">{formatPoints(displayBalance)}</p>
          )}
          <p className="pb-2 font-heading text-lg font-bold">PP</p>
        </div>
        <p className="mt-2 text-sm font-medium opacity-90">= {formatCents(balance * valueCents)} in the store</p>
        {data && (data.held > 0 || data.lifetimeEarned > 0) && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-points-foreground/10 px-2.5 py-1">Lifetime earned {formatPoints(data.lifetimeEarned)}</span>
            {data.held > 0 && <span className="rounded-full bg-points-foreground/10 px-2.5 py-1">{formatPoints(data.held)} reserved for a checkout</span>}
          </div>
        )}
      </section>

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <QuickAction href="#earn" icon={GiftIcon} label="Earn" tone="bg-teal-soft text-secondary" />
        <QuickAction href="#buy" icon={SparklesIcon} label="Buy" tone="bg-coral-soft text-primary" />
        <QuickAction href="/shop" icon={ShoppingBagIcon} label="Spend in store" tone="bg-accent text-points-foreground dark:text-points" />
      </div>

      {q.isError && <ErrorState className="mt-6" title="Couldn't load your points" error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />}

      {/* Ways to earn */}
      <section id="earn" className="mt-8 scroll-mt-24">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-xl">Ways to earn</h2>
          {oneTime.length > 0 && <span className="text-xs font-semibold text-muted-foreground">{doneWays}/{oneTime.length} bonuses unlocked</span>}
        </div>
        {q.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card bg-card ring-1 ring-border">
            {ways.map((w) => (
              <li key={w.id ?? w.title} className={cn("flex items-center gap-3 px-4 py-3", w.done && "bg-success/5")}>
                {w.done ? <CheckCircle2Icon className="size-5 shrink-0 text-success" /> : <CircleIcon className="size-5 shrink-0 text-border" />}
                <span className={cn("min-w-0 flex-1 text-sm", w.done ? "text-muted-foreground line-through decoration-success/60" : "font-medium")}>
                  {w.title}
                  {w.repeatable && <span className="ml-1.5 text-xs text-muted-foreground no-underline">· repeatable</span>}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-points/15 px-2.5 py-1 text-xs font-bold text-points-foreground dark:text-points">
                  {w.id === "order" ? "+1 PP / $1" : `+${w.points} PP`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/invite" />}>
            <GiftIcon data-icon="inline-start" /> Invite a friend
          </Button>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/challenges" />}>
            <TrophyIcon data-icon="inline-start" /> This week&apos;s challenge
          </Button>
        </div>
      </section>

      {/* Buy packs */}
      <section id="buy" className="mt-8 scroll-mt-24">
        <h2 className="mb-1 text-xl">Buy Paw Points</h2>
        <p className="mb-3 text-sm text-muted-foreground">Top up for the Studio. Packs land in your balance as soon as the order is paid.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {packs.map((p, i) => {
            const perPoint = p.priceCents / p.points;
            const best = i === packs.length - 1;
            return (
              <div key={p.sku} className={cn("relative flex flex-col rounded-card bg-card p-5 ring-1 transition", best ? "ring-2 ring-primary" : "ring-border")}>
                {best && <Badge className="absolute -top-2.5 left-4">Best value</Badge>}
                <p className="inline-flex items-center gap-1.5 font-heading text-2xl font-extrabold">
                  <PawIcon className="size-5 text-points" /> {formatPoints(p.points)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {perPoint.toFixed(1)}¢ per point · worth {formatCents(p.points * valueCents)} in store
                </p>
                <Button className="mt-4 w-full" variant={best ? "default" : "outline"} onClick={() => void buyPack(p)} disabled={buying !== null}>
                  {buying === p.sku && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
                  Buy for {formatCents(p.priceCents)}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Rules */}
      <section className="mt-8 rounded-card bg-accent p-5 ring-1 ring-border">
        <h2 className="mb-2 flex items-center gap-2 text-base">
          <InfoIcon className="size-4 text-primary" /> How Paw Points work
        </h2>
        <ul className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
          <li>1 Paw Point is worth {formatCents(valueCents)} in the store and the Studio.</li>
          <li>Redeem at least {rules?.minRedeem ?? 20} PP per order, up to {rules?.maxRedeemPercent ?? 50}% of the subtotal.</li>
          <li>Earn 1 PP per $1 spent on store orders.</li>
          <li>
            {rules?.expiryMonths ? `Points expire after ${rules.expiryMonths} months without activity; we email you 30 days before.` : "Points don't expire right now."}
          </li>
          <li>Images cost {rules?.prices?.image ?? 2} PP; videos from {rules?.prices?.video?.["6"] ?? 8} PP. Failed creations are refunded.</li>
          <li>Reserved points are released if a checkout isn&apos;t completed within {rules?.holdHours ?? 24} hours.</li>
        </ul>
      </section>
    </>
  );
}
