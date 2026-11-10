"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { HeartIcon, PlayIcon, VolumeXIcon, Volume2Icon } from "lucide-react";
import { PawIcon } from "@/components/logo";
import { useVideoPrefStore } from "@/stores/video-preferences";
import { cn } from "@/lib/utils";
import { isOptimizableImage, mediaAspect } from "@/lib/media";
import type { MediaType } from "@/types/post";

interface PostMediaProps {
  src: string;
  type: MediaType;
  poster?: string | null;
  alt?: string;
  width?: number | null;
  height?: number | null;
  /** Double-click / double-tap handler (heart burst is drawn here). */
  onDoubleLike?: () => void;
  /** Lock the aspect ratio (feed cards); otherwise use the media's natural ratio. */
  clampAspect?: boolean;
  priority?: boolean;
  className?: string;
  sizes?: string;
  /** A user video still being transcoded; the original plays while we show a subtle badge. */
  processing?: boolean;
}

export function PostMedia({ src, type, poster, alt = "", width, height, onDoubleLike, clampAspect = true, priority, className, sizes, processing }: PostMediaProps) {
  const [burst, setBurst] = useState(0);
  const [broken, setBroken] = useState(false);
  const lastTap = useRef(0);
  const aspect = clampAspect ? mediaAspect(width, height, 1) : width && height ? width / height : 1;

  const fireLike = () => {
    if (!onDoubleLike) return;
    onDoubleLike();
    setBurst((n) => n + 1);
  };

  // Touch devices don't fire dblclick reliably; detect two taps within 300ms.
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      fireLike();
    } else {
      lastTap.current = now;
    }
  };

  return (
    <div
      className={cn("relative w-full select-none overflow-hidden bg-muted", className)}
      style={{ aspectRatio: String(aspect) }}
      onDoubleClick={fireLike}
      onPointerUp={onPointerUp}
    >
      {type === "video" ? (
        <>
          <AutoplayVideo src={src} poster={poster} />
          {processing && (
            <span className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-xs font-semibold text-foreground shadow-soft backdrop-blur">
              <span className="size-2 animate-pulse rounded-full bg-primary" />
              Optimizing…
            </span>
          )}
        </>
      ) : broken ? (
        <span role="img" aria-label={alt || "Image unavailable"} className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-coral-soft/50 text-primary/60">
          <PawIcon className="size-14" />
          <span className="text-xs font-semibold">Image unavailable</span>
        </span>
      ) : isOptimizableImage(src) ? (
        <Image src={src} alt={alt} fill priority={priority} sizes={sizes ?? "(min-width: 768px) 640px, 100vw"} className="object-cover" draggable={false} onError={() => setBroken(true)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- data: URLs and unknown hosts can't go through the optimizer
        <img src={src} alt={alt} className="absolute inset-0 size-full object-cover" draggable={false} onError={() => setBroken(true)} />
      )}
      {burst > 0 && (
        <span key={burst} className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <HeartIcon className="size-28 animate-in fill-primary text-primary drop-shadow-[0_8px_24px_rgba(0,0,0,0.25)] zoom-in-50 fade-in duration-300 [animation-fill-mode:both]" onAnimationEnd={() => setTimeout(() => setBurst(0), 400)} />
        </span>
      )}
    </div>
  );
}

function AutoplayVideo({ src, poster }: { src: string; poster?: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const visible = useRef(false);
  const [playing, setPlaying] = useState(false);
  // Session-wide sound preference, persisted to localStorage and shared across every feed video.
  const muted = useVideoPrefStore((s) => s.muted);
  const soundUnlocked = useVideoPrefStore((s) => s.soundUnlocked);
  const hydrate = useVideoPrefStore((s) => s.hydrate);
  const setMuted = useVideoPrefStore((s) => s.setMuted);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Start (or restart) playback honoring the sound preference. If the browser blocks unmuted
  // autoplay (no user gesture yet this session) we fall back to muted playback WITHOUT losing the
  // preference — the next gesture flips `soundUnlocked` and this re-runs with sound.
  const applyPlayback = useCallback(() => {
    const el = ref.current;
    if (!el || !visible.current) return;
    el.muted = muted;
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        if (!el.muted) {
          el.muted = true;
          el.play().catch(() => {});
        }
      });
    }
  }, [muted]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const vis = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        visible.current = vis;
        if (vis) applyPlayback();
        else el.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [applyPlayback]);

  // Re-apply when the preference flips or a gesture unlocks sound mid-view.
  useEffect(() => {
    applyPlayback();
  }, [applyPlayback, soundUnlocked]);

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        muted={muted}
        loop
        playsInline
        autoPlay
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="absolute inset-0 size-full object-cover"
      />
      {!playing && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-background/80 text-foreground shadow-soft backdrop-blur">
            <PlayIcon className="ml-0.5 size-6 fill-current" />
          </span>
        </span>
      )}
      <button
        type="button"
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={(e) => {
          e.stopPropagation();
          setMuted(!muted);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className="absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-soft backdrop-blur transition hover:bg-background"
      >
        {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
      </button>
    </>
  );
}
