"use client";

import { ClockIcon, MapPinIcon, PackageIcon, StoreIcon, TruckIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useFulfillment } from "@/hooks/use-shop";
import { cn } from "@/lib/utils";
import type { FulfillmentInfo } from "@/types/shop";

/** One-line strip under the shop header. */
export function FulfillmentBanner({ className }: { className?: string }) {
  const q = useFulfillment();
  const f = q.data?.fulfillment;
  const city = f?.depot.city ?? "Toronto";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl bg-teal-soft px-4 py-2.5 text-xs font-semibold text-secondary sm:text-[13px]", className)}>
      <span className="inline-flex items-center gap-1.5">
        <StoreIcon className="size-4" /> Pickup at our {city} depot
      </span>
      <span className="hidden text-secondary/50 sm:inline">·</span>
      <span className="inline-flex items-center gap-1.5">
        <TruckIcon className="size-4" /> Local delivery
      </span>
      <span className="hidden text-secondary/50 sm:inline">·</span>
      <span className="inline-flex items-center gap-1.5">
        <PackageIcon className="size-4" /> Ships across Canada &amp; US
      </span>
    </div>
  );
}

function Row({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-soft text-secondary [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/** Pickup / local delivery / shipping details. `compact` hides hours and instructions. */
export function FulfillmentOptions({ compact = false, className, footnote }: { compact?: boolean; className?: string; footnote?: React.ReactNode }) {
  const q = useFulfillment();
  const f: FulfillmentInfo | undefined = q.data?.fulfillment;
  if (q.isLoading) {
    return (
      <div className={cn("space-y-3 rounded-card bg-card p-4 ring-1 ring-border", className)}>
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (!f) return null;
  const address = `${f.depot.street1}${f.depot.street2 ? `, ${f.depot.street2}` : ""}, ${f.depot.city}, ${f.depot.province} ${f.depot.postalCode}`;
  return (
    <section className={cn("rounded-card bg-card p-4 ring-1 ring-border sm:p-5", className)} aria-label="Fulfillment options">
      <h3 className="mb-3 text-base">How you get it</h3>
      <div className="space-y-4">
        <Row icon={<StoreIcon />} title={f.pickup.title}>
          <p className="inline-flex flex-wrap items-center gap-1">
            <MapPinIcon className="size-3.5" />
            {f.depot.mapsUrl ? (
              <a href={f.depot.mapsUrl} target="_blank" rel="noreferrer" className="text-secondary underline-offset-2 hover:underline">
                {address}
              </a>
            ) : (
              address
            )}
          </p>
          {!compact && (
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              {f.hours.map((h) => (
                <li key={h.days} className="inline-flex items-center gap-1">
                  <ClockIcon className="size-3" />
                  <span className="font-medium text-foreground">{h.days}</span> {h.close ? `${h.open}–${h.close}` : h.open}
                </li>
              ))}
            </ul>
          )}
          {f.pickup.readyWithinText && <p className="mt-1 text-xs font-medium text-success">{f.pickup.readyWithinText}</p>}
          {!compact && <p className="mt-1.5 text-xs">{f.pickup.instructions}</p>}
        </Row>
        <Row icon={<TruckIcon />} title={f.localDelivery.title}>
          <p>{f.localDelivery.radiusText}</p>
          {(f.localDelivery.feeText || f.localDelivery.windowText) && (
            <p className="mt-1 text-xs">
              {f.localDelivery.feeText}
              {f.localDelivery.feeText && f.localDelivery.windowText ? " · " : ""}
              {f.localDelivery.windowText}
            </p>
          )}
        </Row>
        <Row icon={<PackageIcon />} title={f.shipping.title}>
          <p>{f.shipping.text}</p>
        </Row>
      </div>
      {(footnote || f.notes) && <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">{footnote ?? f.notes}</p>}
    </section>
  );
}
