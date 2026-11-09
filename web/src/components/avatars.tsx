"use client";

import { CatIcon, DogIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { Species } from "@/types/pet";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const sizeClass: Record<AvatarSize, string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
  "2xl": "size-28 text-4xl",
};

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: AvatarSize;
  className?: string;
}

/** User avatar with coloured initial fallback. */
export function UserAvatar({ src, name, size = "md", className }: UserAvatarProps) {
  return (
    <Avatar className={cn(sizeClass[size], className)}>
      {src ? <AvatarImage src={src} alt={name ?? ""} /> : null}
      <AvatarFallback className="bg-teal-soft font-heading font-bold text-secondary">{initials(name, "P")}</AvatarFallback>
    </Avatar>
  );
}

interface PetAvatarProps extends UserAvatarProps {
  species?: Species | null;
}

/** Pet avatar: photo, else a dog/cat icon on a coral tile (initial when no species). */
export function PetAvatar({ src, name, species, size = "md", className }: PetAvatarProps) {
  const Icon = species === "cat" ? CatIcon : species === "dog" ? DogIcon : null;
  return (
    <Avatar className={cn(sizeClass[size], className)}>
      {src ? <AvatarImage src={src} alt={name ?? ""} /> : null}
      <AvatarFallback className="bg-coral-soft font-heading font-bold text-primary">
        {Icon ? <Icon className="size-[55%]" /> : initials(name, "P")}
      </AvatarFallback>
    </Avatar>
  );
}
