"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { HeartIcon, PlayIcon, VolumeXIcon, Volume2Icon } from "lucide-react";
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
}

export function PostMedia({ src, type, poster, alt = "", width, height, onDoubleLike, clampAspect = true, priority, className, sizes }: PostMediaProps) {
  const [burst, setBurst] = useState(0);
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
        <AutoplayVideo src={src} poster={poster} />
      ) : isOptimizableImage(src) ? (
        <Image src={src} alt={alt} fill priority={priority} sizes={sizes ?? "(min-width: 768px) 640px, 100vw"} className="object-cover" draggable={false} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- data: URLs and unknown hosts can't go through the optimizer
        <img src={src} alt={alt} className="absolute inset-0 size-full object-cover" draggable={false} />
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
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
          setMuted((m) => !m);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className="absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-soft backdrop-blur transition hover:bg-background"
      >
        {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
      </button>
    </>
  );
}
