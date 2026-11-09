"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  PhoneIcon,
  ShoppingBagIcon,
  SirenIcon,
  StarIcon,
  UserRoundPenIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { petsService } from "@/services/pets";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";
import type { PartnerResult, PetProfileUpdates, ProductSuggestion, VetAlert } from "@/types/ai";
import type { Pet } from "@/types/pet";

/* ---------------------------------------- Vet alert ---------------------------------------- */

export function VetAlertCard({ alert }: { alert: VetAlert }) {
  const emergency = alert.level === "emergency";
  return (
    <div
      role="alert"
      className={cn(
        "rounded-card p-4 ring-2",
        emergency ? "bg-destructive text-destructive-foreground ring-destructive" : "bg-accent text-foreground ring-points",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-2xl",
            emergency ? "bg-destructive-foreground/20" : "bg-points text-points-foreground",
          )}
        >
          {emergency ? <SirenIcon className="size-6" /> : <AlertTriangleIcon className="size-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg font-extrabold leading-tight">{emergency ? "See a vet now" : "Book a vet visit soon"}</p>
          <p className={cn("mt-1 text-sm leading-relaxed", emergency ? "text-destructive-foreground/90" : "text-muted-foreground")}>
            {alert.reason ? `${alert.reason}. ` : ""}
            {emergency
              ? "This can be life-threatening. Contact a vet or an emergency clinic right away."
              : "These signs are worth a professional look within the next 24 to 48 hours."}
          </p>
          <Button
            size="sm"
            className={cn("mt-3", emergency ? "bg-destructive-foreground text-destructive hover:bg-destructive-foreground/90" : "")}
            variant={emergency ? "default" : "outline"}
            nativeButton={false}
            render={<Link href="/partners?type=vet" />}
          >
            <MapPinIcon data-icon="inline-start" />
            Find a vet near me
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------- Product chips -------------------------------------- */

export function ProductChips({ products }: { products: ProductSuggestion[] }) {
  if (!products.length) return null;
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <ShoppingBagIcon className="size-3.5" /> From the shop
      </p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {products.map((p) => (
          <Tooltip key={p.handle}>
            <TooltipTrigger
              render={
                <Link
                  href={`/shop/${p.handle}`}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-teal-soft pr-3.5 pl-3 text-sm font-semibold text-secondary ring-1 ring-secondary/20 transition hover:ring-secondary/50"
                />
              }
            >
              <ShoppingBagIcon className="size-4" />
              <span className="max-w-[16rem] truncate">{p.title}</span>
            </TooltipTrigger>
            {p.reason && <TooltipContent className="max-w-xs">{p.reason}</TooltipContent>}
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------- Profile update card ---------------------------------- */

function describeUpdates(u: PetProfileUpdates): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (u.weightKg != null) out.push({ label: "Weight", value: `${u.weightKg} kg` });
  if (u.birthday) out.push({ label: "Birthday", value: u.birthday });
  if (u.allergies) out.push({ label: "Allergies", value: u.allergies });
  return out;
}

export function ProfileUpdateCard({ updates, pet }: { updates: PetProfileUpdates; pet: Pet | null }) {
  const qc = useQueryClient();
  const [state, setState] = useState<"idle" | "accepted" | "dismissed">("idle");
  const rows = describeUpdates(updates);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!pet) throw new Error("Pick a pet first");
      const patch: Record<string, unknown> = {};
      if (updates.weightKg != null) patch.weightKg = updates.weightKg;
      if (updates.birthday) patch.birthday = updates.birthday;
      if (updates.allergies) {
        const line = `Allergies: ${updates.allergies}`;
        patch.notes = pet.notes && !pet.notes.includes(line) ? `${pet.notes}\n${line}` : pet.notes ?? line;
      }
      return petsService.update(pet.id, patch);
    },
    onSuccess: () => {
      setState("accepted");
      toast.success(`${pet?.name ?? "Pet"}'s profile updated`);
      void qc.invalidateQueries({ queryKey: queryKeys.pets.all });
      void useSessionStore.getState().refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!rows.length || state === "dismissed") return null;
  return (
    <div className="rounded-card bg-card p-4 ring-1 ring-border">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-teal-soft text-secondary">
          {state === "accepted" ? <CheckIcon className="size-5" /> : <UserRoundPenIcon className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-bold">
            {state === "accepted" ? `${pet?.name ?? "Pet"}'s profile updated` : `Update ${pet?.name ?? "your pet"}'s profile?`}
          </p>
          <dl className="mt-1.5 grid gap-1 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="flex gap-2">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="font-medium">{r.value}</dd>
              </div>
            ))}
          </dl>
          {state === "idle" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !pet}>
                <CheckIcon data-icon="inline-start" /> Accept
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setState("dismissed")}>
                <XIcon data-icon="inline-start" /> Dismiss
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------- Partner cards -------------------------------------- */

export function PartnerCards({ partners }: { partners: PartnerResult[] }) {
  if (!partners.length) return null;
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <MapPinIcon className="size-3.5" /> Nearby partners
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {partners.map((p) => (
          <Link
            key={p.id}
            href={`/partners/${p.id}`}
            className="flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-border transition hover:ring-primary/40"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-coral-soft text-primary">
              <MapPinIcon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                <span className="capitalize">{p.type}</span>
                {p.city ? ` · ${p.city}` : ""}
                {p.distanceKm != null ? ` · ${p.distanceKm < 0.1 ? "nearby" : `${p.distanceKm} km`}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
              {p.rating != null && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-foreground">
                  <StarIcon className="size-3 fill-points text-points" /> {Number(p.rating).toFixed(1)}
                </span>
              )}
              {p.phone && (
                <span className="inline-flex items-center gap-0.5">
                  <PhoneIcon className="size-3" /> Call
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-card rounded-tl-md bg-accent px-4 py-3 ring-1 ring-border" aria-label="Assistant is typing">
      <ClockIcon className="sr-only" />
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 animate-bounce rounded-full bg-primary/70"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
        />
      ))}
    </div>
  );
}
