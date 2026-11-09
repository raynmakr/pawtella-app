"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2Icon, SparklesIcon, TrophyIcon, WandSparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/auth/form-field";
import { PetAvatar } from "@/components/avatars";
import { MediaPicker, type PickedMedia } from "@/components/media-picker";
import { useSession } from "@/stores/session";
import { useChallenges } from "@/hooks/use-challenges";
import { uploadFile } from "@/services/upload";
import { postsService } from "@/services/posts";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { daysLeft } from "@/components/challenges/challenge-utils";

const MAX_CAPTION = 2200;
const NONE = "__none__";

function NewPostInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { user, pets, primaryPet, refresh } = useSession();
  const challenges = useChallenges();

  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [progress, setProgress] = useState<number | undefined>();
  const [petId, setPetId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState<boolean | null>(null);
  const [challengeId, setChallengeId] = useState<string>(params.get("challengeId") ?? NONE);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Defaults come from the session until the user touches the control.
  const effectivePetId = petId ?? (primaryPet ? String(primaryPet.id) : "");
  const effectiveConsent = consent ?? user?.featureConsentDefault ?? false;

  const active = useMemo(() => challenges.data?.active ?? [], [challenges.data]);
  const selectedPet = pets.find((p) => String(p.id) === effectivePetId) ?? null;

  const suggest = async () => {
    if (!media) {
      toast.error("Add a photo first so the AI can see it");
      return;
    }
    if (media.kind !== "image") {
      toast.error("Caption suggestions work with photos for now");
      return;
    }
    setSuggesting(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(media.file);
      });
      const res = await postsService.suggestCaptions({ imageUrl: dataUrl, petName: selectedPet?.name, petId: selectedPet?.id });
      setSuggestions(res.captions ?? []);
      if (!res.captions?.length) toast("No suggestions this time. Try again in a moment.");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't get suggestions"));
    } finally {
      setSuggesting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!media) {
      setError("Add a photo or video to post");
      return;
    }
    setError(null);
    setSubmitting(true);
    const hadFirstPost = user?.bonuses.firstPost ?? true;
    try {
      setProgress(0.05);
      const asset = await uploadFile(media.file, { kind: media.kind, folder: "posts", onProgress: setProgress });
      setProgress(1);
      const res = await postsService.create({
        mediaUrl: asset.secureUrl || asset.url,
        mediaType: media.kind,
        petId: effectivePetId ? Number(effectivePetId) : null,
        caption: caption.trim() || null,
        featureConsent: effectiveConsent,
        challengeId: challengeId !== NONE ? Number(challengeId) : null,
        width: asset.width ?? media.width ?? null,
        height: asset.height ?? media.height ?? null,
        durationSeconds: asset.duration ?? media.duration ?? null,
      });
      void qc.invalidateQueries({ queryKey: queryKeys.posts.all });
      void qc.invalidateQueries({ queryKey: queryKeys.points.all });
      void qc.invalidateQueries({ queryKey: queryKeys.challenges.all });
      if (user) void qc.invalidateQueries({ queryKey: queryKeys.users.posts(user.handle) });
      const session = await refresh();
      if (!hadFirstPost && session.user?.bonuses.firstPost) {
        toast.success("+5 Paw Points for your first post!", { description: "Spend them in the Studio or at checkout." });
      } else {
        toast.success(challengeId !== NONE ? "Posted and entered in the challenge!" : "Posted!");
      }
      router.push(`/post/${res.post.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't publish your post"));
      setProgress(undefined);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <PageHeader eyebrow="Create" title="New post" description="Share a photo or video of your pet with the Pawtella community." />

      <MediaPicker value={media} onChange={(m) => { setMedia(m); setSuggestions([]); setError(null); }} progress={progress} disabled={submitting} onError={(m) => toast.error(m)} />

      <section className="rounded-card bg-card p-4 shadow-soft ring-1 ring-border sm:p-5">
        <div className="grid gap-5">
          {pets.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Who&apos;s in it?</legend>
              <div className="flex flex-wrap gap-2">
                {pets.map((p) => {
                  const selected = String(p.id) === effectivePetId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPetId(selected ? "" : String(p.id))}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full py-1 pr-3.5 pl-1 text-sm font-semibold ring-1 transition",
                        selected ? "bg-coral-soft text-primary ring-primary/40" : "bg-background text-foreground/80 ring-border hover:bg-muted",
                      )}
                    >
                      <PetAvatar src={p.photoUrl} name={p.name} species={p.species} size="sm" />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <FormField label="Caption" htmlFor="caption" description={`${caption.length}/${MAX_CAPTION}`}>
            <Textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))} rows={3} placeholder="Say something about this moment" disabled={submitting} />
          </FormField>
          <div className="-mt-2 flex flex-col gap-2">
            <div>
              <Button type="button" variant="soft" size="sm" onClick={suggest} disabled={suggesting || submitting || !media}>
                {suggesting ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <WandSparklesIcon data-icon="inline-start" />}
                Suggest captions
              </Button>
            </div>
            {suggestions.length > 0 && (
              <ul className="flex flex-col gap-1.5" aria-label="Caption suggestions">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => setCaption(s)} className="w-full rounded-2xl bg-muted/70 px-3.5 py-2.5 text-left text-sm transition hover:bg-coral-soft hover:text-primary">
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <FormField label="Challenge (optional)" htmlFor="challenge" description={active.length ? "Enter this post in this week's challenge." : "No challenge is running right now."}>
            <Select
              value={challengeId}
              onValueChange={(v) => setChallengeId(v ?? NONE)}
              disabled={submitting || active.length === 0}
              items={[{ value: NONE, label: "Not entering a challenge" }, ...active.map((c) => ({ value: String(c.id), label: c.title }))]}
            >
              <SelectTrigger id="challenge" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not entering a challenge</SelectItem>
                {active.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <TrophyIcon className="size-4 text-points-foreground dark:text-points" /> {c.title} · {daysLeft(c.endsAt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-muted/60 px-4 py-3">
            <span>
              <span className="block text-[15px] font-semibold">OK to feature me</span>
              <span className="block text-sm text-muted-foreground">Pawtella may show this post in promos and on the Discover page.</span>
            </span>
            <Switch checked={effectiveConsent} onCheckedChange={(v) => setConsent(Boolean(v))} disabled={submitting} />
          </label>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/home" />} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={submitting || !media}>
          {submitting ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <SparklesIcon data-icon="inline-start" />}
          {submitting ? "Publishing" : "Post"}
        </Button>
      </div>
    </form>
  );
}

export function NewPostForm() {
  return (
    <Suspense fallback={null}>
      <NewPostInner />
    </Suspense>
  );
}
