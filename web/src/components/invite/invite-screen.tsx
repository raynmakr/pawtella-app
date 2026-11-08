"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, GiftIcon, Share2Icon, SparklesIcon, UserPlusIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { PawIcon } from "@/components/logo";
import { useSession } from "@/stores/session";
import { pointsService } from "@/services/points";
import { queryKeys } from "@/lib/query-keys";
import { appUrl, copyText, shareUrl } from "@/lib/share";
import { formatPoints } from "@/lib/format";

const STEPS: Array<{ Icon: LucideIcon; title: string; body: string }> = [
  { Icon: Share2Icon, title: "Share your link", body: "Send it to a friend with a pet (or post it anywhere)." },
  { Icon: UserPlusIcon, title: "They join with +10 PP", body: "Your friend signs up through your link and gets 10 bonus Paw Points." },
  { Icon: SparklesIcon, title: "You get +20 PP", body: "When they make their first Studio creation or place their first order, 20 Paw Points land in your balance." },
];

export function InviteScreen() {
  const { user, isAuthenticated } = useSession();
  const points = useQuery({ queryKey: queryKeys.points.summary, queryFn: () => pointsService.summary(), enabled: isAuthenticated, staleTime: 15_000 });
  const code = user?.referralCode ?? null;
  const link = code ? appUrl(`/r/${code}`) : null;
  const referralWay = points.data?.ways?.find((w) => w.id === "referral");

  const share = () => {
    if (!link) return;
    void shareUrl({
      title: "Join me on Pawtella",
      text: `Pawtella makes AI videos of your pet, answers pet questions and delivers supplies in Toronto. Use my code ${code} for 10 bonus Paw Points.`,
      url: link,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <PageHeader eyebrow="Grow the pack" title="Invite friends" description="Every pet parent you bring along earns you both Paw Points." />

      <section className="relative overflow-hidden rounded-card bg-primary p-6 text-primary-foreground shadow-lift sm:p-8">
        <PawIcon className="absolute -right-6 -bottom-8 size-44 opacity-15" />
        <p className="text-xs font-bold tracking-wider uppercase opacity-90">Your referral code</p>
        {code ? (
          <p className="mt-2 font-heading text-4xl font-extrabold tracking-[0.18em] sm:text-5xl" aria-label={`Referral code ${code}`}>
            {code}
          </p>
        ) : (
          <Skeleton className="mt-2 h-12 w-48 bg-primary-foreground/20" />
        )}
        <p className="mt-3 max-w-sm text-sm opacity-90">Friends enter this code at sign-up, or just tap your link below.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="points" size="lg" onClick={() => code && copyText(code, "Code copied")} disabled={!code}>
            <CopyIcon data-icon="inline-start" /> Copy code
          </Button>
          <Button size="lg" onClick={share} disabled={!link} className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
            <Share2Icon data-icon="inline-start" /> Share link
          </Button>
        </div>
      </section>

      <section className="rounded-card bg-card p-4 shadow-soft ring-1 ring-border sm:p-5">
        <p className="text-sm font-semibold">Your link</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-muted px-3 py-2.5 text-sm">{link ?? "…"}</code>
          <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => link && copyText(link, "Link copied")} disabled={!link}>
            <CopyIcon />
          </Button>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
        <h2 id="how-heading" className="text-lg">
          How it works
        </h2>
        <ol className="mt-4 grid gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3.5">
              <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-coral-soft text-primary">
                <s.Icon className="size-5" />
                <span className="absolute -top-1.5 -left-1.5 flex size-5 items-center justify-center rounded-full bg-primary font-heading text-[11px] font-extrabold text-primary-foreground">{i + 1}</span>
              </span>
              <span>
                <span className="block text-[15px] font-bold">{s.title}</span>
                <span className="block text-sm text-muted-foreground">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="progress-heading" className="rounded-card bg-accent/60 p-5 ring-1 ring-border">
        <div className="flex items-center justify-between gap-3">
          <h2 id="progress-heading" className="text-lg">
            Your rewards
          </h2>
          <GiftIcon className="size-5 text-points-foreground dark:text-points" />
        </div>
        {points.isPending && isAuthenticated ? (
          <Skeleton className="mt-3 h-12 rounded-2xl" />
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card p-3.5 ring-1 ring-border">
              <dt className="text-xs text-muted-foreground">Paw Points balance</dt>
              <dd className="font-heading text-2xl font-extrabold tabular-nums">{formatPoints(points.data?.balance ?? user?.pawPoints ?? 0)}</dd>
            </div>
            <div className="rounded-2xl bg-card p-3.5 ring-1 ring-border">
              <dt className="text-xs text-muted-foreground">Per friend who converts</dt>
              <dd className="font-heading text-2xl font-extrabold tabular-nums">+{referralWay?.points ?? 20}</dd>
            </div>
          </dl>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
          Referral and share bonuses are capped at 200 Paw Points per month. Points are promotional credit with no cash value.
        </p>
      </section>
    </div>
  );
}
