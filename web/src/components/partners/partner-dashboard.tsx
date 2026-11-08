"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BanknoteIcon,
  ClockIcon,
  CoinsIcon,
  CopyIcon,
  GiftIcon,
  HandshakeIcon,
  Loader2Icon,
  PrinterIcon,
  Share2Icon,
  TicketPercentIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/auth/form-field";
import { UserAvatar } from "@/components/avatars";
import { usePartnerMe } from "@/hooks/use-partners";
import { partnersService } from "@/services/partners";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/api";
import { formatCents, formatPoints, timeAgo } from "@/lib/format";
import { copyText, shareUrl } from "@/lib/share";
import { cn } from "@/lib/utils";
import { isDashboard, type PartnerDashboard as Dashboard, type PartnerEarning, type PartnerTier } from "@/types/partner";

const TIER_LABEL: Record<PartnerTier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };
const TIER_TONE: Record<PartnerTier, string> = {
  bronze: "text-primary",
  silver: "text-muted-foreground",
  gold: "text-points-foreground dark:text-points",
};

function TierRing({ d }: { d: Dashboard }) {
  const progress = d.tier.next ? d.tier.next.progress : 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-5">
      <div className="relative size-32 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={d.tier.id === "gold" ? "var(--points)" : d.tier.id === "silver" ? "var(--secondary)" : "var(--primary)"} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} className="transition-[stroke-dashoffset] duration-700" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-heading text-lg font-extrabold", TIER_TONE[d.tier.id])}>{TIER_LABEL[d.tier.id]}</span>
          <span className="text-[11px] font-semibold text-muted-foreground">{d.tier.discountPercent}% off</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-2xl font-extrabold tabular-nums">
          {d.tier.activeReferred} <span className="text-base font-bold text-muted-foreground">active clients</span>
        </p>
        {d.tier.next ? (
          <p className="mt-1 text-sm text-muted-foreground">
            <strong className="text-foreground">{d.tier.next.remaining}</strong> more active referred {d.tier.next.remaining === 1 ? "client" : "clients"} to reach {TIER_LABEL[d.tier.next.id]} ({d.rules.tiers.find((t) => t.id === d.tier.next!.id)?.discountPercent}% off, featured listing).
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">You&apos;re at the top tier. Thank you for spreading the word.</p>
        )}
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {d.tier.perks.map((p) => (
            <li key={p} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Money({ label, cents, tone }: { label: string; cents: number; tone?: string }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3.5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-heading text-xl font-extrabold tabular-nums", tone)}>{formatCents(cents)}</p>
    </div>
  );
}

function earningLabel(e: PartnerEarning) {
  switch (e.type) {
    case "commission":
      return e.orderNumber ? `Commission on order ${e.orderNumber}` : "Commission";
    case "redeem_points":
      return `Redeemed for ${formatPoints(Number(e.metadata?.points ?? 0))} Paw Points`;
    case "redeem_gift_card":
      return "Redeemed as gift card";
    case "payout":
      return `Payout (${String(e.metadata?.method ?? "")})`;
    default:
      return "Adjustment";
  }
}

function RedeemDialog({ d, open, onOpenChange }: { d: Dashboard; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<"points" | "gift_card">("points");
  const [amount, setAmount] = useState(String((d.earnings.availableCents / 100).toFixed(2)));
  const [pending, setPending] = useState(false);
  const cents = Math.round(Number(amount) * 100);
  const points = Math.floor(cents / d.rules.redeemPointsCentsPerPoint);
  const valid = Number.isInteger(cents) && cents > 0 && cents <= d.earnings.availableCents;
  const submit = async () => {
    if (!valid) return;
    setPending(true);
    try {
      const res = await partnersService.redeem({ type, amountCents: cents });
      void qc.invalidateQueries({ queryKey: queryKeys.partners.me });
      void qc.invalidateQueries({ queryKey: queryKeys.points.all });
      toast.success(type === "points" ? `+${formatPoints(res.points ?? points)} Paw Points added` : `Gift card created · ends in ${res.giftCard?.lastCharacters ?? "…"}`, {
        description: type === "gift_card" && res.giftCard ? `Code: ${res.giftCard.code}` : undefined,
        duration: 8000,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't redeem"));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-card p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Redeem earnings</DialogTitle>
          <DialogDescription>Available: {formatCents(d.earnings.availableCents)}. Paw Points convert at ${(d.rules.redeemPointsCentsPerPoint / 100).toFixed(2)} each (a 25% bonus over cash).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Redeem as">
            {(["points", "gift_card"] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cn("flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold ring-1 transition", type === t ? "bg-coral-soft text-primary ring-primary/40" : "bg-background ring-border hover:bg-muted")}>
                {t === "points" ? <CoinsIcon className="size-4" /> : <GiftIcon className="size-4" />}
                {t === "points" ? "Paw Points" : "Gift card"}
              </button>
            ))}
          </div>
          <FormField label="Amount (CAD)" htmlFor="redeem-amount" error={amount && !valid ? "Enter an amount up to your available balance" : undefined} description={type === "points" && valid ? `= ${formatPoints(points)} Paw Points` : undefined}>
            <Input id="redeem-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter className="rounded-b-card">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || pending}>
            {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
            Redeem {valid ? formatCents(cents) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayoutDialog({ d, open, onOpenChange }: { d: Dashboard; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<string>(d.rules.payoutMethods[0] ?? "etransfer");
  const [amount, setAmount] = useState(String((d.earnings.availableCents / 100).toFixed(2)));
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const cents = Math.round(Number(amount) * 100);
  const valid = Number.isInteger(cents) && cents >= d.rules.minPayoutCents && cents <= d.earnings.availableCents && details.trim().length > 0;
  const submit = async () => {
    if (!valid) return;
    setPending(true);
    try {
      await partnersService.payout({ amountCents: cents, method, details: details.trim() });
      void qc.invalidateQueries({ queryKey: queryKeys.partners.me });
      toast.success("Payout requested", { description: "We process payouts within 5 business days." });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't request a payout"));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-card p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Request a payout</DialogTitle>
          <DialogDescription>
            Minimum {formatCents(d.rules.minPayoutCents)}. Available: {formatCents(d.earnings.availableCents)}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <FormField label="Method" htmlFor="payout-method">
            <Select value={method} onValueChange={(v) => v && setMethod(v)}>
              <SelectTrigger id="payout-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {d.rules.payoutMethods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m === "etransfer" ? "Interac e-Transfer" : m === "gift_card" ? "Gift card" : m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Amount (CAD)" htmlFor="payout-amount" error={amount && (cents < d.rules.minPayoutCents || cents > d.earnings.availableCents) ? `Between ${formatCents(d.rules.minPayoutCents)} and ${formatCents(d.earnings.availableCents)}` : undefined}>
            <Input id="payout-amount" type="number" inputMode="decimal" min={(d.rules.minPayoutCents / 100).toFixed(2)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label={method === "etransfer" ? "e-Transfer email or phone" : "Where should we send it?"} htmlFor="payout-details">
            <Textarea id="payout-details" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} placeholder={method === "etransfer" ? "payments@happypaws.ca" : "Email address for the gift card"} />
          </FormField>
        </div>
        <DialogFooter className="rounded-b-card">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || pending}>
            {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
            Request payout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PartnerDashboard() {
  const q = usePartnerMe();
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);

  if (q.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5">
        <Skeleton className="h-20 rounded-card" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-card" />
          <Skeleton className="h-48 rounded-card" />
        </div>
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }
  if (q.isError) return <ErrorState title="Couldn't load your dashboard" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!q.data) {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <EmptyState
          icon={<HandshakeIcon />}
          title="You're not a partner yet"
          description="Pet businesses earn 10% on every order their clients place, plus a supplies discount and a directory listing."
          action={
            <Button nativeButton={false} render={<Link href="/partner/apply" />}>
              Apply now
            </Button>
          }
        />
      </div>
    );
  }
  if (!isDashboard(q.data)) {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <EmptyState
          icon={<ClockIcon />}
          title={q.data.status === "pending" ? "Application in review" : q.data.status === "rejected" ? "Application not approved" : "Partner account paused"}
          description={
            q.data.status === "pending"
              ? `We're reviewing ${q.data.partner.businessName}. You'll get an email when you're approved, usually within 2 business days.`
              : "Reach out to support if you have questions about this decision."
          }
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/profile" />}>
              Back to profile
            </Button>
          }
        />
      </div>
    );
  }

  const d = q.data;
  const canRedeem = d.earnings.availableCents > 0;
  const canPayout = d.earnings.availableCents >= d.rules.minPayoutCents;

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5">
      <PageHeader
        eyebrow="Partner program"
        title={d.partner.businessName}
        description={`Approved partner · code ${d.code}`}
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/partners/${d.partner.id}`} />}>
            View public listing
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
          <h2 className="mb-4 text-lg">Your tier</h2>
          <TierRing d={d} />
        </section>

        <section className="flex flex-col rounded-card bg-secondary p-5 text-secondary-foreground shadow-soft">
          <div className="flex items-center gap-2">
            <TicketPercentIcon className="size-5" />
            <h2 className="text-lg text-secondary-foreground">Supplies discount</h2>
          </div>
          <p className="mt-1 text-sm opacity-90">{d.tier.discountPercent}% off every order in the Pawtella shop. Use it at checkout.</p>
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-secondary-foreground/10 p-2 pl-4">
            <code className="min-w-0 flex-1 truncate font-heading text-xl font-extrabold tracking-wider">{d.discountCode ?? "Issuing…"}</code>
            <Button size="icon" variant="outline" className="shrink-0 border-secondary-foreground/30 bg-transparent text-secondary-foreground hover:bg-secondary-foreground/10 hover:text-secondary-foreground" aria-label="Copy discount code" disabled={!d.discountCode} onClick={() => d.discountCode && copyText(d.discountCode, "Discount code copied")}>
              <CopyIcon />
            </Button>
          </div>
          <Button variant="points" className="mt-4 self-start" nativeButton={false} render={<Link href="/shop" />}>
            Shop supplies
          </Button>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <section className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
          <div className="flex items-center gap-2">
            <UsersIcon className="size-5 text-secondary" />
            <h2 className="text-lg">Referred clients</h2>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-muted/60 p-3.5">
              <dt className="text-xs font-semibold text-muted-foreground">Total</dt>
              <dd className="font-heading text-2xl font-extrabold tabular-nums">{d.referred.total}</dd>
            </div>
            <div className="rounded-2xl bg-muted/60 p-3.5">
              <dt className="text-xs font-semibold text-muted-foreground">Active (90d)</dt>
              <dd className="font-heading text-2xl font-extrabold tabular-nums">{d.referred.active}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{d.referred.orders} orders placed by your clients so far.</p>
          {d.referred.recent.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2.5">
              {d.referred.recent.slice(0, 5).map((r) => (
                <li key={`${r.handle}-${r.attributedAt}`} className="flex items-center gap-2.5 text-sm">
                  <UserAvatar src={r.avatarUrl} name={r.handle} size="xs" />
                  <span className="min-w-0 flex-1 truncate font-semibold">@{r.handle}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.attributedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BanknoteIcon className="size-5 text-success" />
              <h2 className="text-lg">Earnings</h2>
            </div>
            <Badge variant="outline" className="h-6">
              {d.rules.commissionPercent}% commission · matures in {d.rules.commissionMaturityDays} days
            </Badge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Money label="Pending" cents={d.earnings.pendingCents} tone="text-muted-foreground" />
            <Money label="Available" cents={d.earnings.availableCents} tone="text-success" />
            <Money label="Paid out" cents={d.earnings.paidCents} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setRedeemOpen(true)} disabled={!canRedeem}>
              <CoinsIcon data-icon="inline-start" /> Redeem
            </Button>
            <Button variant="outline" onClick={() => setPayoutOpen(true)} disabled={!canPayout}>
              <BanknoteIcon data-icon="inline-start" /> Request payout
            </Button>
          </div>
          {!canPayout && <p className="mt-2 text-xs text-muted-foreground">Payouts unlock at {formatCents(d.rules.minPayoutCents)} available.</p>}
          <h3 className="mt-5 text-sm font-bold">Recent activity</h3>
          {d.earnings.recent.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No earnings yet. Share your code and they&apos;ll show up here after your clients order.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {d.earnings.recent.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{earningLabel(e)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {timeAgo(e.createdAt)} · {e.status}
                    </span>
                  </span>
                  <span className={cn("shrink-0 font-heading font-extrabold tabular-nums", e.amountCents < 0 ? "text-muted-foreground" : "text-success")}>
                    {e.amountCents < 0 ? "−" : "+"}
                    {formatCents(Math.abs(e.amountCents), e.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
        <div className="flex items-center gap-2">
          <Share2Icon className="size-5 text-primary" />
          <h2 className="text-lg">Share tools</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Clients who scan or enter your code get 10 bonus Paw Points and are linked to you for 12 months.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
          <div className="mx-auto flex flex-col items-center gap-2 sm:mx-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- PNG streamed by the API */}
            <img src="/api/partners/me/qr" alt={`QR code for ${d.links.referral}`} width={176} height={176} className="size-44 rounded-2xl bg-white p-2 ring-1 ring-border" />
            <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/partners/me/poster" target="_blank" rel="noreferrer" />}>
              <PrinterIcon data-icon="inline-start" /> Print poster
            </Button>
          </div>
          <div className="grid gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Referral code</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded-xl bg-muted px-3.5 py-2.5 font-heading text-lg font-extrabold tracking-widest">{d.code}</code>
                <Button variant="outline" size="icon" aria-label="Copy code" onClick={() => copyText(d.code, "Code copied")}>
                  <CopyIcon />
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Referral link</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl bg-muted px-3.5 py-2.5 text-sm">{d.links.referral}</code>
                <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => copyText(d.links.referral, "Link copied")}>
                  <CopyIcon />
                </Button>
              </div>
            </div>
            <div>
              <Button onClick={() => shareUrl({ title: `${d.partner.businessName} on Pawtella`, text: `Get 10 free Paw Points on Pawtella with code ${d.code}`, url: d.links.referral })}>
                <Share2Icon data-icon="inline-start" /> Share link
              </Button>
            </div>
          </div>
        </div>
      </section>

      <RedeemDialog d={d} open={redeemOpen} onOpenChange={setRedeemOpen} />
      <PayoutDialog d={d} open={payoutOpen} onOpenChange={setPayoutOpen} />
    </div>
  );
}
