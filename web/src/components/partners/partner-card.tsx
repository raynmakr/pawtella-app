"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPinIcon, StarIcon, StoreIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isOptimizableImage } from "@/lib/media";
import { cn } from "@/lib/utils";
import { partnerTypeLabel, type Partner } from "@/types/partner";

export function PartnerLogo({ partner, size = "md", className }: { partner: Pick<Partner, "logoUrl" | "businessName">; size?: "md" | "lg"; className?: string }) {
  const cls = cn("relative shrink-0 overflow-hidden rounded-2xl bg-teal-soft text-secondary", size === "lg" ? "size-20" : "size-14", className);
  if (partner.logoUrl) {
    return (
      <span className={cls}>
        {isOptimizableImage(partner.logoUrl) ? (
          <Image src={partner.logoUrl} alt="" fill sizes="80px" className="object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- unknown host
          <img src={partner.logoUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </span>
    );
  }
  return (
    <span className={cn(cls, "flex items-center justify-center")}>
      <StoreIcon className={size === "lg" ? "size-9" : "size-6"} />
    </span>
  );
}

export function Rating({ avg, count, className }: { avg: number | null; count: number; className?: string }) {
  if (!count || avg == null) return <span className={cn("text-xs text-muted-foreground", className)}>No reviews yet</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", className)}>
      <StarIcon className="size-3.5 fill-points text-points" />
      {avg.toFixed(1)} <span className="font-normal text-muted-foreground">({count})</span>
    </span>
  );
}

export function PartnerCard({ partner: p }: { partner: Partner }) {
  return (
    <Link href={`/partners/${p.id}`} className="flex items-center gap-4 rounded-card bg-card p-4 shadow-soft ring-1 ring-border transition hover:ring-primary/40">
      <PartnerLogo partner={p} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base leading-snug">{p.businessName}</h3>
          {p.isFeatured && <Badge className="h-5 bg-points text-points-foreground">Featured</Badge>}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-semibold text-secondary">{partnerTypeLabel(p.type)}</span>
          {p.city && <span>· {p.city}</span>}
          {p.distanceKm != null && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-teal-soft px-1.5 py-px font-semibold text-secondary">
              <MapPinIcon className="size-3" /> {p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1)} km`}
            </span>
          )}
        </p>
        <Rating avg={p.ratingAvg} count={p.ratingCount} className="mt-1.5" />
      </div>
    </Link>
  );
}
