"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightIcon, LoaderCircleIcon, SparklesIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { aiService } from "@/services/ai";
import { usePostGeneration } from "@/hooks/use-generation";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/stores/session";
import type { Generation } from "@/types/ai";
import type { Pet } from "@/types/pet";

interface ShareToFeedDialogProps {
  generation: Generation;
  pet: Pet | null;
  challengeTitle?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_CAPTION = 500;

export function ShareToFeedDialog({ generation, pet, challengeTitle, open, onOpenChange }: ShareToFeedDialogProps) {
  const { user } = useSession();
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(user?.featureConsentDefault ?? false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const post = usePostGeneration(generation.id);

  const suggest = useMutation({
    mutationFn: () =>
      aiService.captions({
        imageUrl:
          [generation.kind === "video" ? generation.thumbnailUrl : generation.outputUrl, generation.sourceImageUrl, generation.outputUrl].find(
            (u): u is string => !!u && /^(https?:\/\/|data:image\/)/i.test(u),
          ) ?? "",
        petName: pet?.name,
      }),
    onSuccess: (res) => setSuggestions(res.captions),
    onError: (err) => toast.error(errorMessage(err, "Couldn't suggest captions")),
  });

  const submit = () => {
    post.mutate(
      { caption: caption.trim() || undefined, featureConsent: consent, challengeId: generation.challengeId },
      {
        onSuccess: (res) => {
          onOpenChange(false);
          toast.success(res.alreadyPosted ? "Already on your feed" : "Posted to your feed!", {
            action: { label: "View post", onClick: () => router.push(`/post/${res.post.id}`) },
          });
        },
        onError: (err) => toast.error(errorMessage(err, "Couldn't post")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share to feed</DialogTitle>
          <DialogDescription>Your creation goes to your profile and the discover feed.</DialogDescription>
        </DialogHeader>

        {generation.challengeId && (
          <div className="flex items-center gap-2 rounded-xl bg-points/15 px-3 py-2 text-sm">
            <TrophyIcon className="size-4 text-points-foreground dark:text-points" />
            <span className="flex-1 font-medium">Entering {challengeTitle ? `“${challengeTitle}”` : "the challenge"}</span>
            <Badge className="bg-points text-points-foreground">Challenge</Badge>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="caption" className="text-sm font-semibold">Caption</label>
            <Button type="button" variant="ghost" size="sm" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
              {suggest.isPending ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <SparklesIcon data-icon="inline-start" />}
              Suggest captions
            </Button>
          </div>
          <Textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
            placeholder={`Say something about ${pet?.name ?? "your pet"}…`}
            rows={3}
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{caption.length}/{MAX_CAPTION}</p>
          {suggestions.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCaption(s)}
                  className="rounded-xl bg-accent px-3 py-2 text-left text-sm ring-1 ring-border transition hover:ring-primary/40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-start justify-between gap-3 rounded-2xl bg-card px-3.5 py-3 ring-1 ring-border">
          <span>
            <span className="block text-sm font-semibold">Let Pawtella feature this</span>
            <span className="block text-xs leading-relaxed text-muted-foreground">We may share it on our socials with your @{user?.handle ?? "handle"} credit.</span>
          </span>
          <Switch checked={consent} onCheckedChange={setConsent} aria-label="Feature consent" />
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={post.isPending}>
            {post.isPending ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <ArrowRightIcon data-icon="inline-start" />}
            Post it
          </Button>
        </DialogFooter>
        {generation.postId && (
          <p className="text-center text-xs text-muted-foreground">
            Already posted · <Link href={`/post/${generation.postId}`} className="font-semibold text-primary">view post</Link>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
