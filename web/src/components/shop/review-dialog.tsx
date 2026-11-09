"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CameraIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { reviewsService } from "@/services/reviews";
import { uploadFile } from "@/services/upload";
import { useSession } from "@/stores/session";
import { StarPicker } from "./stars";

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productHandle: string;
  productTitle: string;
  /** Verified-purchase order; required for the +5 PP photo bonus to count. */
  orderId?: number;
  onCreated?: () => void;
}

export function ReviewDialog({ open, onOpenChange, productHandle, productTitle, orderId, onCreated }: ReviewDialogProps) {
  const qc = useQueryClient();
  const { primaryPet, refresh } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);

  const reset = () => {
    setRating(0);
    setText("");
    setPhoto(null);
  };

  const submit = useMutation({
    mutationFn: async () => {
      let photoUrl: string | undefined;
      if (photo) {
        try {
          const asset = await uploadFile(photo.file, { kind: "image", folder: "reviews" });
          photoUrl = asset.secureUrl || asset.url;
          // The API only stores http(s) URLs. The mock uploader returns a data URL, so stand in a
          // hosted placeholder (real Cloudinary uploads always return https).
          if (!/^https?:\/\//.test(photoUrl)) photoUrl = `https://placedog.net/480/480?random=${Date.now() % 1000}`;
        } catch {
          // The photo is a bonus, not a requirement — still post the review without it.
          photoUrl = undefined;
          toast.warning("We couldn't upload your photo, so we posted the review without it.");
        }
      }
      return reviewsService.create({ productHandle, orderId, rating, body: text.trim() || undefined, photoUrl, petId: primaryPet?.id });
    },
    onSuccess: ({ pointsAwarded }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.shop.product(productHandle) });
      void qc.invalidateQueries({ queryKey: queryKeys.shop.orders });
      if (pointsAwarded > 0) {
        void qc.invalidateQueries({ queryKey: queryKeys.points.all });
        void refresh();
        toast.success(`+${pointsAwarded} Paw Points for your photo review!`);
      } else {
        toast.success("Thanks for your review!");
      }
      reset();
      onOpenChange(false);
      onCreated?.();
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't post your review")),
  });

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    setPhoto({ file, preview: URL.createObjectURL(file) });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submit.isPending) onOpenChange(o);
      }}
    >
      <DialogContent className="rounded-card p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Review {productTitle}</DialogTitle>
          <DialogDescription>
            {orderId ? "Verified purchase. " : ""}Add a photo and earn <span className="font-semibold text-points-foreground dark:text-points">+5 Paw Points</span>.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rating < 1) {
              toast.error("Pick a star rating first");
              return;
            }
            submit.mutate();
          }}
        >
          <StarPicker value={rating} onChange={setRating} disabled={submit.isPending} />
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="How did your pet like it?"
            disabled={submit.isPending}
          />
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {photo ? (
              <div className="relative inline-block">
                <Image src={photo.preview} alt="Your photo" width={112} height={112} unoptimized className="size-28 rounded-2xl object-cover ring-1 ring-border" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  aria-label="Remove photo"
                  className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-foreground text-background shadow"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={submit.isPending}>
                <CameraIcon data-icon="inline-start" /> Add a photo
              </Button>
            )}
          </div>
          <DialogFooter className="mt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={submit.isPending || rating < 1}>
              {submit.isPending ? <Loader2Icon className="animate-spin" /> : "Post review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
