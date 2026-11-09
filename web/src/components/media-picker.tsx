"use client";

import { useRef } from "react";
import { ImagePlusIcon, Loader2Icon, RefreshCwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PickedMedia {
  file: File;
  preview: string;
  kind: "image" | "video";
  width?: number;
  height?: number;
  duration?: number;
}

/** Read natural dimensions (and duration for video) from a local file. */
export async function probeMedia(file: File): Promise<PickedMedia> {
  const preview = URL.createObjectURL(file);
  const kind: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
  return new Promise((resolve) => {
    if (kind === "image") {
      const img = new Image();
      img.onload = () => resolve({ file, preview, kind, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ file, preview, kind });
      img.src = preview;
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve({ file, preview, kind, width: v.videoWidth, height: v.videoHeight, duration: v.duration });
      v.onerror = () => resolve({ file, preview, kind });
      v.src = preview;
    }
  });
}

interface MediaPickerProps {
  value: PickedMedia | null;
  onChange: (m: PickedMedia | null) => void;
  accept?: string;
  /** 0..1 while uploading; undefined when idle. */
  progress?: number;
  disabled?: boolean;
  maxBytes?: number;
  onError?: (message: string) => void;
  className?: string;
}

export function MediaPicker({ value, onChange, accept = "image/*,video/*", progress, disabled, maxBytes = 25 * 1024 * 1024, onError, className }: MediaPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = progress !== undefined && progress < 1;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      onError?.("Choose a photo or a video");
      return;
    }
    if (file.size > maxBytes) {
      onError?.(`That file is too big (max ${Math.round(maxBytes / 1024 / 1024)} MB)`);
      return;
    }
    if (value) URL.revokeObjectURL(value.preview);
    onChange(await probeMedia(file));
  };

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {value ? (
        <div className="relative overflow-hidden rounded-card bg-muted ring-1 ring-border" style={{ aspectRatio: value.width && value.height ? `${value.width} / ${value.height}` : "1" }}>
          {value.kind === "video" ? (
            <video src={value.preview} muted loop playsInline autoPlay className="absolute inset-0 size-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={value.preview} alt="Preview" className="absolute inset-0 size-full object-cover" />
          )}
          {uploading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
              <Loader2Icon className="size-7 animate-spin text-primary" />
              <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              </div>
              <p className="text-xs font-semibold text-muted-foreground">Uploading {Math.round((progress ?? 0) * 100)}%</p>
            </div>
          )}
          {!uploading && !disabled && (
            <div className="absolute top-3 right-3 flex gap-2">
              <Button type="button" size="icon-sm" variant="outline" className="rounded-full bg-background/90" aria-label="Replace media" onClick={() => inputRef.current?.click()}>
                <RefreshCwIcon />
              </Button>
              <Button type="button" size="icon-sm" variant="outline" className="rounded-full bg-background/90" aria-label="Remove media" onClick={() => { URL.revokeObjectURL(value.preview); onChange(null); }}>
                <XIcon />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick(e.dataTransfer.files?.[0]);
          }}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-border bg-card/60 text-center transition hover:border-primary/50 hover:bg-coral-soft/40 sm:aspect-[16/9]"
        >
          <span className="flex size-16 items-center justify-center rounded-3xl bg-coral-soft text-primary">
            <ImagePlusIcon className="size-8" />
          </span>
          <span>
            <span className="block font-heading text-base font-bold">Add a photo or video</span>
            <span className="block text-sm text-muted-foreground">Tap to choose, or drop a file here</span>
          </span>
        </button>
      )}
    </div>
  );
}
