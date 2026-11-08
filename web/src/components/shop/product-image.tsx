"use client";

import Image from "next/image";
import { useState } from "react";
import { PawIcon } from "@/components/logo";
import { cn } from "@/lib/utils";

/** `fill` image with a paw placeholder when there is no URL or the remote image fails to load. */
export function ProductImage({ src, alt = "", sizes, className, priority }: { src?: string | null; alt?: string; sizes: string; className?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={cn("absolute inset-0 flex items-center justify-center bg-coral-soft text-primary/40", className)} aria-hidden>
        <PawIcon className="size-[40%]" />
      </span>
    );
  }
  return <Image src={src} alt={alt} fill unoptimized priority={priority} sizes={sizes} className={cn("object-cover", className)} onError={() => setFailed(true)} />;
}
