"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CalendarCheckIcon,
  GlobeIcon,
  AtSignIcon,
  Link2Icon,
  Loader2Icon,
  MapPinIcon,
  PhoneIcon,
  StarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { UserAvatar } from "@/components/avatars";
import { usePartner } from "@/hooks/use-partners";
import { partnersService } from "@/services/partners";
import { useSession } from "@/stores/session";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage, isApiError } from "@/lib/api";
import { googleMapsUrl } from "@/lib/media";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { partnerTypeLabel, type PartnerDetail as PartnerDetailType } from "@/types/partner";
import { PartnerLogo, Rating } from "./partner-card";

function Stars({ value, onChange, size = "size-7" }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <div className="flex gap-1" role={onChange ? "radiogroup" : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role={onChange ? "radio" : undefined}
          aria-checked={onChange ? n === value : undefined}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={cn("transition", onChange && "hover:scale-110 active:scale-95")}
        >
          <StarIcon className={cn(size, n <= value ? "fill-points text-points" : "text-border")} />
        </button>
      ))}
    </div>
  );
}

function ReviewDialog({ partner, open, onOpenChange }: { partner: PartnerDetailType; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!rating) {
      toast.error("Pick a star rating");
      return;
    }
    setPending(true);
    try {
      await partnersService.addReview(partner.id, { rating, body: body.trim() || undefined });
      toast.success("Thanks for your review!");
      void qc.invalidateQueries({ queryKey: queryKeys.partners.detail(partner.id) });
      void qc.invalidateQueries({ queryKey: ["partners"] });
      onOpenChange(false);
      setRating(0);
      setBody("");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save your review"));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-card p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Review {partner.businessName}</DialogTitle>
          <DialogDescription>How was your experience? Your review is public under your handle.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <Stars value={rating} onChange={setRating} size="size-9" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} placeholder="What stood out?" aria-label="Review" />
        </div>
        <DialogFooter className="rounded-b-card">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
            Post review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkAccount({ partner }: { partner: PartnerDetailType }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const link = async () => {
    setPending(true);
    try {
      const res = await partnersService.attribute(partner.code);
      void qc.invalidateQueries({ queryKey: queryKeys.points.all });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      setDone(res.alreadyAttributed ? "You're already linked with this partner." : `Linked! +${res.bonusPoints} Paw Points added to your balance.`);
      toast.success(res.alreadyAttributed ? "Already linked" : `+${res.bonusPoints} Paw Points`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't link your account"));
      setOpen(false);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Button variant="soft" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Link2Icon data-icon="inline-start" /> I&apos;m a client — link my account
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-card p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Link with {partner.businessName}?</DialogTitle>
            <DialogDescription>
              {done ?? `You'll get 10 bonus Paw Points now, and ${partner.businessName} earns a small commission on your Pawtella orders for the next 12 months. You can only be linked with one partner at a time.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="rounded-b-card">
            {done ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Not now
                </Button>
                <Button onClick={link} disabled={pending}>
                  {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
                  Link my account
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PartnerDetail({ id }: { id: string }) {
  const q = usePartner(id);
  const { user } = useSession();
  const [reviewOpen, setReviewOpen] = useState(false);

  if (q.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
        <Skeleton className="h-44 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    );
  }
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <EmptyState
          title="Partner not found"
          description="This business isn't listed, or isn't approved yet."
          action={
            <Button nativeButton={false} render={<Link href="/partners" />}>
              All partners
            </Button>
          }
        />
      );
    }
    return <ErrorState title="Couldn't load this partner" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }
  const p = q.data.partner;
  const address = [p.street1, p.city, p.province, p.postalCode].filter(Boolean).join(", ");
  const maps = googleMapsUrl([p.businessName, p.street1, p.city, p.province], p.lat, p.lng);
  const phoneHref = p.phone ? `tel:${p.phone.replace(/[^\d+]/g, "")}` : null;
  const canReview = !!user;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" nativeButton={false} render={<Link href="/partners" />}>
          <ArrowLeftIcon data-icon="inline-start" /> Partners
        </Button>
      </div>

      <header className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border sm:p-6">
        <div className="flex items-start gap-4">
          <PartnerLogo partner={p} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl">{p.businessName}</h1>
              {p.isFeatured && <Badge className="bg-points text-points-foreground">Featured</Badge>}
            </div>
            <p className="mt-1 text-sm font-semibold text-secondary">{partnerTypeLabel(p.type)}</p>
            <Rating avg={p.reviews.average} count={p.reviews.count} className="mt-1.5 text-sm" />
          </div>
        </div>
        {p.description && <p className="mt-4 text-[15px] leading-relaxed">{p.description}</p>}
        {address && (
          <a href={maps} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-start gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <MapPinIcon className="mt-0.5 size-4 shrink-0" /> {address}
          </a>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {phoneHref && (
            <Button nativeButton={false} render={<a href={phoneHref} />}>
              <PhoneIcon data-icon="inline-start" /> Call
            </Button>
          )}
          {p.website && (
            <Button variant="outline" nativeButton={false} render={<a href={p.website} target="_blank" rel="noreferrer" />}>
              <GlobeIcon data-icon="inline-start" /> Website
            </Button>
          )}
          {p.bookingUrl && (
            <Button variant="secondary" nativeButton={false} render={<a href={p.bookingUrl} target="_blank" rel="noreferrer" />}>
              <CalendarCheckIcon data-icon="inline-start" /> Book
            </Button>
          )}
          <Button variant="outline" nativeButton={false} render={<a href={maps} target="_blank" rel="noreferrer" />}>
            <MapPinIcon data-icon="inline-start" /> Map
          </Button>
          {p.instagram && (
            <Button variant="ghost" nativeButton={false} render={<a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" />}>
              <AtSignIcon data-icon="inline-start" /> @{p.instagram}
            </Button>
          )}
        </div>
      </header>

      {p.services.length > 0 && (
        <section className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
          <h2 className="text-lg">Services</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {p.services.map((s) => (
              <li key={s} className="rounded-full bg-teal-soft px-3 py-1 text-sm font-semibold text-secondary">
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {user && p.code && (
        <section className="flex flex-col gap-3 rounded-card bg-coral-soft/60 p-5 ring-1 ring-primary/15 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg">Already a client?</h2>
            <p className="text-sm text-muted-foreground">Link your Pawtella account and get 10 bonus Paw Points.</p>
          </div>
          <LinkAccount partner={p} />
        </section>
      )}

      <section className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg">
            Reviews <span className="text-muted-foreground">({p.reviews.count})</span>
          </h2>
          {canReview && (
            <Button variant="outline" size="sm" onClick={() => setReviewOpen(true)}>
              <StarIcon data-icon="inline-start" /> Write a review
            </Button>
          )}
        </div>
        {p.reviews.recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No reviews yet. Be the first to share your experience.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {p.reviews.recent.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                <UserAvatar src={r.avatarUrl} name={r.displayName ?? r.handle} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Link href={`/u/${r.handle}`} className="text-sm font-bold hover:underline">
                      {r.displayName ?? r.handle}
                    </Link>
                    <Stars value={r.rating} size="size-3.5" />
                    <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                  </div>
                  {r.body && <p className="mt-1 text-sm leading-relaxed">{r.body}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReviewDialog partner={p} open={reviewOpen} onOpenChange={setReviewOpen} />
    </div>
  );
}
