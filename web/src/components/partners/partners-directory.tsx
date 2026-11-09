"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HandshakeIcon, Loader2Icon, LocateFixedIcon, SearchIcon, StoreIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { usePartners } from "@/hooks/use-partners";
import { cn } from "@/lib/utils";
import { PARTNER_TYPES } from "@/types/partner";
import { PartnerCard } from "./partner-card";

const CHIP_TYPES = PARTNER_TYPES.filter((t) => t.value !== "other");

function DirectoryInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const type = params.get("type") ?? "";
  const q = params.get("q") ?? "";
  const lat = params.get("lat") ? Number(params.get("lat")) : null;
  const lng = params.get("lng") ? Number(params.get("lng")) : null;
  const [search, setSearch] = useState(q);
  const [locating, setLocating] = useState(false);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn't available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        update({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) });
        toast.success("Showing partners near you");
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? "Location permission was denied" : "Couldn't get your location");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const list = usePartners({ lat, lng, type: type || null, q: q || null });
  const partners = list.data?.partners ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <PageHeader
        eyebrow="Near you"
        title="Local partners"
        description="Vets, groomers, walkers and shops we trust. Link your account with one to earn bonus Paw Points."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/partner/apply" />}>
            <HandshakeIcon data-icon="inline-start" /> Become a partner
          </Button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: search.trim() || null });
        }}
        className="flex gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, service or neighbourhood" className="pl-10" aria-label="Search partners" />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); update({ q: null }); }} className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <XIcon className="size-4" />
            </button>
          )}
        </div>
        <Button type="button" variant={lat != null ? "secondary" : "outline"} onClick={lat != null ? () => update({ lat: null, lng: null }) : locate} disabled={locating} className="h-11 shrink-0">
          {locating ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <LocateFixedIcon data-icon="inline-start" />}
          <span className="hidden sm:inline">{lat != null ? "Near me" : "Use my location"}</span>
          <span className="sm:hidden">{lat != null ? "Near me" : "Locate"}</span>
        </Button>
      </form>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by type">
        <button type="button" aria-pressed={!type} onClick={() => update({ type: null })} className={chip(!type)}>
          All
        </button>
        {CHIP_TYPES.map((t) => (
          <button key={t.value} type="button" aria-pressed={type === t.value} onClick={() => update({ type: type === t.value ? null : t.value })} className={chip(type === t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <ListSkeleton rows={5} />
      ) : list.isError ? (
        <ErrorState title="Couldn't load partners" error={list.error} onRetry={() => list.refetch()} retrying={list.isFetching} />
      ) : partners.length === 0 ? (
        <EmptyState
          icon={<StoreIcon />}
          title={q || type ? "No partners match" : "No partners here yet"}
          description={q || type ? "Try a different type or clear the search." : "We're onboarding Toronto businesses now. Know one? Send them our way."}
          action={
            q || type ? (
              <Button variant="outline" onClick={() => { setSearch(""); update({ q: null, type: null }); }}>
                Clear filters
              </Button>
            ) : (
              <Button nativeButton={false} render={<Link href="/partner/apply" />}>
                Apply as a partner
              </Button>
            )
          }
        />
      ) : (
        <ul className={cn("flex flex-col gap-3", list.isFetching && "opacity-70 transition-opacity")}>
          {partners.map((p) => (
            <li key={p.id}>
              <PartnerCard partner={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function chip(active: boolean) {
  return cn(
    "h-9 shrink-0 rounded-full px-4 text-sm font-semibold ring-1 transition",
    active ? "bg-secondary text-secondary-foreground ring-secondary" : "bg-card text-foreground/80 ring-border hover:bg-muted",
  );
}

export function PartnersDirectory() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <DirectoryInner />
    </Suspense>
  );
}
