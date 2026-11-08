"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckIcon, HistoryIcon, ImageIcon, LoaderCircleIcon, SparklesIcon, TrophyIcon, UploadIcon, VideoIcon, WandSparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { PetChips } from "@/components/pet-chips";
import { Segmented } from "@/components/segmented";
import { PawIcon } from "@/components/logo";
import { useSession } from "@/stores/session";
import { usePointsBalance } from "@/hooks/use-points";
import { useCreateGeneration, usePresets } from "@/hooks/use-generation";
import { uploadFile } from "@/services/upload";
import { challengesService } from "@/services/challenges";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { allowedDurations, DEFAULT_PRICES, generationCost } from "@/lib/generation-cost";
import { formatPoints } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GenerationKind, Preset, PresetCategory } from "@/types/ai";
import type { Pet } from "@/types/pet";

const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2"];
const CATEGORY_LABEL: Record<PresetCategory, string> = { seasonal: "Seasonal", fun: "Just for fun", portrait: "Portraits", challenge: "Challenge picks" };

/** Client replica of lib/ai-presets.js renderPrompt(). */
function renderPrompt(template: string, pet: Pet | null): string {
  const name = pet?.name || "my pet";
  const species = pet?.species || "pet";
  const breed = pet?.breed || "";
  return template
    .replace(/\{petName\}/g, name)
    .replace(/\{species\}/g, breed ? `${breed} ${species}` : species)
    .replace(/\{breed\}/g, breed)
    .replace(/\s{2,}/g, " ")
    .trim();
}

type Source = { kind: "pet" | "post" | "upload"; url: string } | null;

export function isHttpUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && /^(https?:\/\/|data:image\/)/i.test(u);
}

interface RecentPost {
  id: number;
  mediaUrl: string;
  mediaType: string;
  thumbnailUrl: string | null;
}

export function StudioScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { pets, primaryPet, user } = useSession();
  const presetsQ = usePresets();
  const points = usePointsBalance();
  const create = useCreateGeneration();

  const qChallenge = params.get("challengeId") ? Number(params.get("challengeId")) : null;
  const qPreset = params.get("presetId");
  const qPet = params.get("petId") ? Number(params.get("petId")) : null;

  // "Override" state holds explicit user choices; undefined means "derive the default".
  const [petOverride, setPetOverride] = useState<number | null | undefined>(undefined);
  const [sourceOverride, setSourceOverride] = useState<Source | undefined>(undefined);
  const [kindOverride, setKindOverride] = useState<GenerationKind | undefined>(undefined);
  const [presetId, setPresetId] = useState<string | null>(qPreset);
  const [customPrompt, setCustomPrompt] = useState("");
  const [durationOverride, setDurationOverride] = useState<number | undefined>(undefined);
  const [hd, setHd] = useState(false);
  const [aspectOverride, setAspectOverride] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const petId = petOverride !== undefined ? petOverride : (qPet ?? primaryPet?.id ?? null);
  const pet = useMemo(() => pets.find((p) => p.id === petId) ?? null, [pets, petId]);
  // Source defaults to the chosen pet's photo; picking a post/upload overrides it.
  const source: Source = sourceOverride !== undefined ? sourceOverride : pet?.photoUrl ? { kind: "pet", url: pet.photoUrl } : null;
  const setSource = (s: Source) => setSourceOverride(s?.kind === "pet" ? undefined : s);

  const recentQ = useQuery<{ posts: RecentPost[] }>({
    queryKey: queryKeys.users.posts(user?.handle ?? ""),
    queryFn: () => api<{ posts: RecentPost[] }>(`/api/users/${user?.handle}/posts`),
    enabled: !!user?.handle,
    staleTime: 60_000,
  });
  // Mock media returns bare public ids for thumbnails; only trust real URLs.
  const recentPhotos = (recentQ.data?.posts ?? [])
    .filter((p) => p.mediaType === "image" && isHttpUrl(p.mediaUrl))
    .map((p) => ({ ...p, thumbnailUrl: isHttpUrl(p.thumbnailUrl) ? p.thumbnailUrl : null }))
    .slice(0, 8);

  const challengeQ = useQuery({
    queryKey: queryKeys.challenges.all,
    queryFn: () => challengesService.list(),
    enabled: qChallenge !== null,
    staleTime: 60_000,
  });
  const challenge = qChallenge ? [...(challengeQ.data?.active ?? []), ...(challengeQ.data?.upcoming ?? [])].find((c) => c.id === qChallenge) ?? null : null;

  const prices = presetsQ.data?.prices ?? points.query.data?.rules?.prices ?? DEFAULT_PRICES;
  const durations = allowedDurations(prices);
  const presets = presetsQ.data?.presets ?? [];
  const preset: Preset | null = presets.find((p) => p.id === presetId) ?? null;
  const unknownPreset = !!qPreset && presetsQ.isSuccess && !presets.some((p) => p.id === qPreset);
  // Kind follows a single-kind preset until the user picks one explicitly.
  const kind: GenerationKind = kindOverride ?? (preset && preset.kind !== "both" ? preset.kind : "image");
  const visiblePresets = presets.filter((p) => p.kind === "both" || p.kind === kind);
  const aspectRatio = aspectOverride ?? (preset?.aspectRatio && ASPECT_RATIOS.includes(preset.aspectRatio) ? preset.aspectRatio : "1:1");
  const duration = durationOverride ?? (preset?.suggestedDuration && durations.includes(preset.suggestedDuration) ? preset.suggestedDuration : durations[0] ?? 6);

  const setKind = (k: GenerationKind) => {
    setKindOverride(k);
    if (preset && preset.kind !== "both" && preset.kind !== k) setPresetId(null);
  };
  const choosePreset = (p: Preset | null) => {
    setPresetId(p?.id ?? null);
    // Let the preset's own aspect ratio / duration apply.
    setAspectOverride(undefined);
    setDurationOverride(undefined);
    if (p && p.kind !== "both") setKindOverride(p.kind);
  };

  const renderedPreset = preset ? renderPrompt(preset.prompt, pet) : "";
  const finalPrompt = preset ? (customPrompt.trim() ? `${renderedPreset}. ${customPrompt.trim()}` : renderedPreset) : customPrompt.trim();

  const cost = generationCost({ kind, duration, hd }, prices);
  // Read the balance from the query only (not the session snapshot) so server and client render alike.
  const balanceKnown = points.query.data !== undefined;
  const balance = points.query.data?.balance ?? 0;
  const insufficient = balanceKnown && balance < cost;
  const needsSource = kind === "video" && !source && !pet?.photoUrl && preset?.kind !== "video";
  const canGenerate = balanceKnown && !!finalPrompt && !insufficient && !needsSource && !create.isPending && !uploading;

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image");
    setUploading(true);
    try {
      const asset = await uploadFile(file, { kind: "image", folder: "pawtella/studio" });
      setSource({ kind: "upload", url: asset.secureUrl || asset.url });
    } catch (err) {
      toast.error(errorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const generate = async () => {
    if (!canGenerate) return;
    try {
      const gen = await create.mutateAsync({
        kind,
        presetId: preset?.id ?? null,
        prompt: preset ? customPrompt.trim() || undefined : customPrompt.trim(),
        petId,
        sourceImageUrl: source?.url ?? null,
        duration: kind === "video" ? duration : undefined,
        hd,
        aspectRatio: kind === "image" ? aspectRatio : undefined,
        challengeId: qChallenge,
        expectedCost: cost,
      });
      router.push(`/studio/${gen.id}`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not start the generation"));
    }
  };

  const grouped = useMemo(() => {
    const out = new Map<PresetCategory, Preset[]>();
    for (const p of visiblePresets) out.set(p.category, [...(out.get(p.category) ?? []), p]);
    return out;
  }, [visiblePresets]);

  return (
    <>
      <PageHeader
        eyebrow="AI Studio"
        title="Make something of your pet"
        description="Pick a photo, choose a look, and spend a few Paw Points."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/studio/history" />}>
            <HistoryIcon data-icon="inline-start" /> History
          </Button>
        }
      />

      {challenge && (
        <div className="mb-6 flex items-center gap-3 rounded-card bg-points/15 p-4 ring-1 ring-points/40">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-points text-points-foreground">
            <TrophyIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Challenge entry</p>
            <p className="truncate font-heading font-bold">{challenge.title}</p>
          </div>
          <Badge className="bg-points text-points-foreground">+{challenge.rewardPoints} PP to win</Badge>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          {/* Step 1 */}
          <Step n={1} title="Choose your pet and a photo">
            <PetChips pets={pets} value={petId} onChange={setPetOverride} />
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
              {pet?.photoUrl && (
                <SourceTile
                  url={pet.photoUrl}
                  label={`${pet.name}'s photo`}
                  active={source?.kind === "pet"}
                  onClick={() => setSource({ kind: "pet", url: pet.photoUrl as string })}
                />
              )}
              {recentPhotos.map((p) => (
                <SourceTile
                  key={p.id}
                  url={p.thumbnailUrl || p.mediaUrl}
                  label="Recent post"
                  active={source?.kind === "post" && source.url === p.mediaUrl}
                  onClick={() => setSource({ kind: "post", url: p.mediaUrl })}
                />
              ))}
              {source?.kind === "upload" && <SourceTile url={source.url} label="Uploaded" active onClick={() => undefined} />}
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-card text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary"
              >
                {uploading ? <LoaderCircleIcon className="size-5 animate-spin" /> : <UploadIcon className="size-5" />}
                Upload
              </button>
            </div>
            {!source && kind === "image" && <p className="mt-2 text-xs text-muted-foreground">No photo? Image presets work from the prompt alone.</p>}
            {needsSource && <p className="mt-2 text-xs font-medium text-destructive">Videos are made from a photo. Pick or upload one.</p>}
          </Step>

          {/* Step 2 */}
          <Step n={2} title="Pick a look">
            <Segmented
              aria-label="Kind"
              value={kind}
              onChange={(k) => setKind(k)}
              className="sm:max-w-sm"
              options={[
                { value: "image", label: <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><ImageIcon className="size-4" /> Image · {generationCost({ kind: "image" }, prices)} PP</span> },
                { value: "video", label: <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><VideoIcon className="size-4" /> Video · {generationCost({ kind: "video", duration: durations[0] }, prices)}+ PP</span> },
              ]}
            />
            {unknownPreset && (
              <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                The challenge&apos;s preset isn&apos;t available right now. Pick any look below or write your own prompt.
              </p>
            )}
            {presetsQ.isLoading ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
              </div>
            ) : presetsQ.isError ? (
              <ErrorState className="mt-4 py-8" title="Couldn't load presets" error={presetsQ.error} onRetry={() => void presetsQ.refetch()} retrying={presetsQ.isFetching} />
            ) : (
              <div className="mt-4 space-y-5">
                {(["seasonal", "fun", "portrait", "challenge"] as PresetCategory[]).map((cat) => {
                  const list = grouped.get(cat);
                  if (!list?.length) return null;
                  return (
                    <div key={cat}>
                      <p className="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">{CATEGORY_LABEL[cat]}</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {list.map((p) => {
                          const active = presetId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() => choosePreset(active ? null : p)}
                              className={cn(
                                "relative flex flex-col items-start gap-1.5 rounded-2xl bg-card p-3.5 text-left ring-1 transition hover:ring-primary/40",
                                active ? "ring-2 ring-primary" : "ring-border",
                              )}
                            >
                              <span className="text-2xl leading-none">{p.emoji}</span>
                              <span className="text-sm leading-tight font-bold">{p.title}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {p.kind === "both" ? "Image or video" : p.kind === "video" ? "Video" : "Image"}
                              </span>
                              {active && (
                                <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <CheckIcon className="size-3" strokeWidth={3} />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5">
              <Label htmlFor="prompt" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                <WandSparklesIcon className="size-4 text-primary" /> {preset ? "Add your own twist (optional)" : "Or write your own prompt"}
              </Label>
              {preset && (
                <div className="mb-2 rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">{preset.emoji} {preset.title}:</span> {renderedPreset}
                </div>
              )}
              <Textarea
                id="prompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value.slice(0, 1000))}
                placeholder={preset ? "e.g. with a tiny red scarf, snowing" : `Describe the scene. e.g. ${pet?.name ?? "My pet"} as a jazz musician on a rainy rooftop`}
                rows={2}
              />
            </div>
          </Step>

          {/* Step 3 */}
          <Step n={3} title="Options">
            {kind === "video" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-sm font-semibold">Length</p>
                  <Segmented
                    aria-label="Duration"
                    value={duration}
                    onChange={setDurationOverride}
                    options={durations.map((d) => ({ value: d, label: `${d} s · ${generationCost({ kind: "video", duration: d, hd }, prices)} PP` }))}
                  />
                </div>
                <label className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
                  <span>
                    <span className="block text-sm font-semibold">HD (1080p)</span>
                    <span className="block text-xs text-muted-foreground">Sharper, ×{prices.hdMultiplier} the points</span>
                  </span>
                  <Switch checked={hd} onCheckedChange={setHd} aria-label="HD" />
                </label>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-sm font-semibold">Aspect ratio</p>
                  <Select value={aspectRatio} onValueChange={(v) => v && setAspectOverride(String(v))}>
                    <SelectTrigger className="w-full" aria-label="Aspect ratio">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASPECT_RATIOS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r} {r === "1:1" ? "· square" : r === "9:16" ? "· story" : r === "16:9" ? "· wide" : r === "3:4" ? "· portrait" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
                  <span>
                    <span className="block text-sm font-semibold">HD (2K)</span>
                    <span className="block text-xs text-muted-foreground">Sharper, ×{prices.hdMultiplier} the points</span>
                  </span>
                  <Switch checked={hd} onCheckedChange={setHd} aria-label="HD" />
                </label>
              </div>
            )}
          </Step>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-10 lg:self-start">
          <div className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
            <div className="flex items-start gap-3">
              <div className="size-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
                {source ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={source.url} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <SparklesIcon className="size-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{kind === "video" ? `${duration} s video` : "Image"}{hd ? " · HD" : ""}</p>
                <p className="mt-0.5 line-clamp-3 text-sm leading-snug">{finalPrompt || <span className="text-muted-foreground">Pick a look or write a prompt to see the preview.</span>}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-accent px-4 py-3">
              <span className="text-sm text-muted-foreground">This costs</span>
              <span className="inline-flex items-center gap-1.5 font-heading text-lg font-extrabold">
                <PawIcon className="size-4 text-points" /> {cost} Paw Points
              </span>
            </div>
            <p className={cn("mt-2 text-center text-xs", insufficient ? "font-semibold text-destructive" : "text-muted-foreground")}>
              {!balanceKnown ? "Checking your balance…" : insufficient ? `You have ${formatPoints(balance)} · you need ${cost - balance} more` : `You have ${formatPoints(balance)} · ${formatPoints(balance - cost)} after`}
            </p>

            {insufficient ? (
              <Button size="lg" className="mt-4 w-full bg-points text-points-foreground hover:bg-points/90" nativeButton={false} render={<Link href="/points" />}>
                <PawIcon data-icon="inline-start" /> Get more Paw Points
              </Button>
            ) : (
              <Button size="lg" className="mt-4 w-full" onClick={() => void generate()} disabled={!canGenerate}>
                {create.isPending ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <SparklesIcon data-icon="inline-start" />}
                {create.isPending ? "Starting…" : `Generate for ${cost} PP`}
              </Button>
            )}
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Points are refunded automatically if a generation fails.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2.5 text-lg">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SourceTile({ url, label, active, onClick }: { url: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("relative size-24 shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 transition hover:ring-primary/40", active ? "ring-2 ring-primary" : "ring-border")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="size-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pt-4 pb-1.5 text-left text-[11px] font-semibold text-white">{label}</span>
      {active && (
        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
