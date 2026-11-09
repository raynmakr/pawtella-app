"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlusIcon, LoaderCircleIcon, MapPinIcon, MapPinOffIcon, SendHorizontalIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { uploadFile } from "@/services/upload";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ChatLocation } from "@/types/ai";

interface ComposerProps {
  disabled?: boolean;
  onSend: (payload: { message: string; imageUrl: string | null; location: ChatLocation | null }) => Promise<unknown>;
  location: ChatLocation | null;
  onLocationChange: (loc: ChatLocation | null) => void;
  placeholder?: string;
  /** Controlled text so the parent can inject suggested prompts. */
  text: string;
  onTextChange: (text: string) => void;
}

export function Composer({ disabled, onSend, location, onLocationChange, placeholder, text, onTextChange: setText }: ComposerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const canSend = !disabled && !uploading && (text.trim().length > 0 || !!imageUrl);

  const submit = async () => {
    if (!canSend) return;
    const payload = { message: text.trim(), imageUrl, location };
    setText("");
    setImageUrl(null);
    try {
      await onSend(payload);
    } catch {
      // The thread shows the failed turn with a retry; nothing more to do here.
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    setUploading(true);
    try {
      const asset = await uploadFile(file, { kind: "image", folder: "pawtella/chat" });
      setImageUrl(asset.secureUrl || asset.url);
    } catch (err) {
      toast.error(errorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggleLocation = () => {
    if (location) {
      onLocationChange(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Location is not available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocationChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success("Location shared for nearby partner lookups");
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? "Location permission was denied" : "Could not get your location");
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <div className="rounded-card bg-card p-2 shadow-soft ring-1 ring-border focus-within:ring-primary/40">
      {(imageUrl || uploading) && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <div className="relative">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Attachment preview" className="size-16 rounded-xl object-cover ring-1 ring-border" />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-xl bg-muted">
                <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {imageUrl && (
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => setImageUrl(null)}
                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{uploading ? "Uploading photo…" : "Photo attached"}</span>
        </div>
      )}
      <Textarea
        ref={textRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder ?? "Ask anything about your pet…"}
        rows={1}
        disabled={disabled}
        aria-label="Message"
        className="max-h-40 min-h-11 resize-none border-0 bg-transparent px-2.5 py-2.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <div className="flex items-center gap-1">
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0])} />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Attach a photo" onClick={() => fileRef.current?.click()} disabled={disabled || uploading} />
              }
            >
              <ImagePlusIcon />
            </TooltipTrigger>
            <TooltipContent>Attach a photo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={!!location}
                  aria-label={location ? "Stop sharing location" : "Share my location"}
                  onClick={toggleLocation}
                  disabled={disabled || locating}
                  className={cn(location && "bg-teal-soft text-secondary hover:bg-teal-soft")}
                />
              }
            >
              {locating ? <LoaderCircleIcon className="animate-spin" /> : location ? <MapPinIcon /> : <MapPinOffIcon />}
            </TooltipTrigger>
            <TooltipContent>{location ? "Location shared · tap to stop" : "Share my location for nearby vets and groomers"}</TooltipContent>
          </Tooltip>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">Enter to send · Shift+Enter for a new line</span>
        </div>
        <Button type="button" size="icon" aria-label="Send" onClick={() => void submit()} disabled={!canSend}>
          <SendHorizontalIcon />
        </Button>
      </div>
    </div>
  );
}
