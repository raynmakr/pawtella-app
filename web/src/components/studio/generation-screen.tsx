"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  Share2Icon,
  SparklesIcon,
  TrophyIcon,
  UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { PawIcon } from "@/components/logo";
import { useGeneration } from "@/hooks/use-generation";
import { aiService } from "@/services/ai";
import { challengesService } from "@/services/challenges";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/stores/session";
import { cn } from "@/lib/utils";
import type { Generation } from "@/types/ai";
import { ShareToFeedDialog } from "./share-dialog";

const STATUS_COPY = [
  [0, "Warming up the paws…"],
  [10, "Sketching the scene…"],
  [30, "Adding whiskers and sparkle…"],
  [55, "Rendering fur, one strand at a time…"],
  [75, "Polishing the final frames…"],
  [90, "Almost there. Treats incoming…"],
] as const;

function statusCopy(progress: number): string {
  let out: string = STATUS_COPY[0][1];
  for (const [min, text] of STATUS_COPY) if (progress >= min) out = text;
  return out;
}

async function downloadUrl(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export function GenerationScreen({ id }: { id: string }) {
  const { pets } = useSession();
  const q = useGeneration(id);
  const gen = q.data;
  const pet = useMemo(() => pets.find((p) => p.id === gen?.petId) ?? null, [pets, gen?.petId]);
  const [feedOpen, setFeedOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const challengeQ = useQuery({
    queryKey: queryKeys.challenges.all,
    queryFn: () => challengesService.list(),
    enabled: !!gen?.challengeId,
    staleTime: 60_000,
  });
  const challengeTitle = gen?.challengeId
    ? [...(challengeQ.data?.active ?? []), ...(challengeQ.data?.upcoming ?? []), ...(challengeQ.data?.recent ?? [])].find((c) => c.id === gen.challengeId)?.title ?? null
    : null;

  if (q.isLoading) {
    return (
      <>
        <PageHeader eyebrow="AI Studio" title="Your creation" />
        <Skeleton className="mx-auto aspect-square w-full max-w-xl rounded-card" />
      </>
    );
  }
  if (q.isError || !gen) {
    return (
      <>
        <PageHeader eyebrow="AI Studio" title="Your creation" />
        <ErrorState title="Couldn't load this creation" error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </>
    );
  }

  const inFlight = gen.status === "queued" || gen.status === "running";
  const progress = gen.status === "done" ? 100 : Math.max(inFlight ? 3 : 0, gen.progress || 0);
  const makeAnotherHref = `/studio${gen.petId ? `?petId=${gen.petId}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="AI Studio"
        title={gen.status === "done" ? "Ta-da!" : gen.status === "failed" ? "That didn't work" : "Making your creation"}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="capitalize">{gen.kind}</span>
            {gen.durationSeconds && gen.kind === "video" ? <span>· {gen.durationSeconds} s</span> : null}
            {gen.hd && <Badge variant="secondary">HD</Badge>}
            <span className="inline-flex items-center gap-1 text-points-foreground dark:text-points">
              <PawIcon className="size-3.5" /> {gen.pointsCharged} PP
            </span>
            {gen.challengeId && (
              <Badge className="bg-points text-points-foreground">
                <TrophyIcon /> {challengeTitle ?? "Challenge entry"}
              </Badge>
            )}
          </span>
        }
      />

      <div className="mx-auto max-w-xl">
        {/* Media / progress */}
        <div className="relative overflow-hidden rounded-card bg-card shadow-soft ring-1 ring-border">
          {gen.status === "done" && gen.outputUrl ? (
            gen.kind === "video" ? (
              <video src={gen.outputUrl} poster={gen.thumbnailUrl && /^https?:\/\//.test(gen.thumbnailUrl) ? gen.thumbnailUrl : undefined} controls autoPlay loop muted playsInline className="block max-h-[70vh] w-full bg-black object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gen.outputUrl} alt={gen.prompt} className="block max-h-[70vh] w-full object-contain" />
            )
          ) : (
            <div className="relative flex aspect-square flex-col items-center justify-center p-8 text-center">
              {gen.sourceImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gen.sourceImageUrl} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-20 blur-xl" />
              )}
              <div className="relative">
                {gen.status === "failed" ? (
                  <div className="flex size-20 items-center justify-center rounded-3xl bg-destructive/10 text-destructive">
                    <RotateCcwIcon className="size-9" />
                  </div>
                ) : (
                  <div className="relative flex size-24 items-center justify-center">
                    <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                    <span className="relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lift">
                      <SparklesIcon className="size-9 animate-pulse" />
                    </span>
                  </div>
                )}
                {inFlight && (
                  <>
                    <p className="mt-6 font-heading text-xl font-extrabold">{statusCopy(progress)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {gen.kind === "video" ? "Videos take a minute or two. You can leave; we'll let you know." : "Images usually take a few seconds."}
                    </p>
                    <div className="mx-auto mt-5 w-64 max-w-full">
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="mt-1.5 text-xs font-semibold tabular-nums text-muted-foreground">{progress}%</p>
                    </div>
                  </>
                )}
                {gen.status === "failed" && (
                  <>
                    <p className="mt-6 font-heading text-xl font-extrabold">Generation failed</p>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">{gen.error || "The provider couldn't finish this one."}</p>
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                      <CheckIcon className="size-3.5" /> {gen.pointsRefunded || gen.pointsCharged} Paw Points refunded
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 line-clamp-3 text-center text-sm text-muted-foreground">“{gen.prompt}”</p>

        {/* Actions */}
        {gen.status === "done" && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Button size="lg" className="col-span-2 sm:col-span-1" onClick={() => setFeedOpen(true)}>
              <UploadIcon data-icon="inline-start" /> {gen.postId ? "Posted" : "Share to feed"}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setShareOpen(true)}>
              <Share2Icon data-icon="inline-start" /> Share
            </Button>
            <Button size="lg" variant="outline" onClick={() => void downloadUrl(gen.outputUrl as string, `pawtella-${gen.id}.${gen.kind === "video" ? "mp4" : "jpg"}`)}>
              <DownloadIcon data-icon="inline-start" /> Download
            </Button>
            <Button size="lg" variant="secondary" className="col-span-2 sm:col-span-1" nativeButton={false} render={<Link href={makeAnotherHref} />}>
              <SparklesIcon data-icon="inline-start" /> Make another
            </Button>
          </div>
        )}
        {gen.status === "failed" && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" nativeButton={false} render={<Link href={`${makeAnotherHref}${gen.presetId ? `${gen.petId ? "&" : "?"}presetId=${encodeURIComponent(gen.presetId)}` : ""}`} />}>
              <RotateCcwIcon data-icon="inline-start" /> Try again
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/studio/history" />}>
              View history
            </Button>
          </div>
        )}
        {gen.postId && gen.status === "done" && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            On your feed · <Link href={`/post/${gen.postId}`} className="font-semibold text-primary">view post</Link>
          </p>
        )}
      </div>

      {gen.status === "done" && (
        <>
          <ShareToFeedDialog generation={gen} pet={pet} challengeTitle={challengeTitle} open={feedOpen} onOpenChange={setFeedOpen} />
          <ShareDialog generation={gen} open={shareOpen} onOpenChange={setShareOpen} />
        </>
      )}
    </>
  );
}

/* ----------------------------------- External share ---------------------------------- */

function ShareDialog({ generation, open, onOpenChange }: { generation: Generation; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<{ shareUrl: string; mediaUrl: string } | null>(null);

  const resolve = async () => {
    if (links) return links;
    const mediaFallback = generation.watermarkedUrl || generation.outputUrl || "";
    let out = { shareUrl: mediaFallback, mediaUrl: mediaFallback };
    if (generation.postId) {
      try {
        const res = await aiService.sharePost(generation.postId, "web");
        out = { shareUrl: res.shareUrl, mediaUrl: res.watermarkedUrl || mediaFallback };
      } catch {
        // fall back to the watermarked media URL
      }
    }
    setLinks(out);
    return out;
  };

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const nativeShare = async () => {
    setBusy(true);
    try {
      const l = await resolve();
      const text = "Made with Pawtella AI Studio";
      try {
        const res = await fetch(l.mediaUrl);
        const blob = await res.blob();
        const file = new File([blob], `pawtella-${generation.id}.${generation.kind === "video" ? "mp4" : "jpg"}`, { type: blob.type });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text, url: l.shareUrl });
          return;
        }
      } catch {
        // media fetch blocked (CORS) or unsupported: share the link instead
      }
      await navigator.share({ title: "Pawtella", text, url: l.shareUrl });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) toast.error(errorMessage(err, "Sharing failed"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    setBusy(true);
    try {
      const l = await resolve();
      await navigator.clipboard.writeText(l.shareUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't copy"));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const l = await resolve();
      await downloadUrl(l.mediaUrl, `pawtella-${generation.id}-share.${generation.kind === "video" ? "mp4" : "jpg"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>
            {generation.postId
              ? "Your link includes your referral code: friends who join earn you Paw Points."
              : "Share the watermarked version. Post it to the feed first to get a referral link."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {canNativeShare && (
            <Button size="lg" onClick={() => void nativeShare()} disabled={busy}>
              {busy ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <Share2Icon data-icon="inline-start" />}
              Share…
            </Button>
          )}
          <Button size="lg" variant={canNativeShare ? "outline" : "default"} onClick={() => void copy()} disabled={busy}>
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button size="lg" variant="outline" onClick={() => void download()} disabled={busy}>
            <DownloadIcon data-icon="inline-start" /> Download watermarked {generation.kind}
          </Button>
          {links && (
            <a href={links.shareUrl} target="_blank" rel="noreferrer" className={cn("mt-1 inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-primary")}>
              <ExternalLinkIcon className="size-3" /> Open share link
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
