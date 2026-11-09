"use client";

import Link from "next/link";
import { CatIcon, DogIcon } from "lucide-react";
import { UserAvatar } from "@/components/avatars";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PostAuthor, PostPet } from "@/types/post";

interface AuthorRowProps {
  author: PostAuthor;
  pet?: PostPet | null;
  createdAt?: string;
  /** Right-aligned slot (menu, follow button). */
  trailing?: React.ReactNode;
  className?: string;
}

export function PetChip({ pet, className }: { pet: PostPet; className?: string }) {
  const Icon = pet.species === "cat" ? CatIcon : DogIcon;
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-coral-soft px-2 text-xs font-semibold whitespace-nowrap text-primary", className)}>
      <Icon className="size-3.5" />
      {pet.name} · {pet.species}
    </span>
  );
}

export function AuthorRow({ author, pet, createdAt, trailing, className }: AuthorRowProps) {
  const name = author.displayName ?? `@${author.handle}`;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Link href={`/u/${author.handle}`} className="shrink-0" aria-label={`${name}'s profile`}>
        <UserAvatar src={author.avatarUrl} name={name} size="md" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/u/${author.handle}`} className="truncate text-[15px] font-bold hover:underline">
            {author.displayName ?? author.handle}
          </Link>
          {pet && <PetChip pet={pet} className="hidden sm:inline-flex" />}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
          <span className="truncate">@{author.handle}</span>
          {createdAt && (
            <>
              <span aria-hidden>·</span>
              <time dateTime={createdAt} className="shrink-0">{timeAgo(createdAt)}</time>
            </>
          )}
        </div>
        {pet && <PetChip pet={pet} className="mt-1 sm:hidden" />}
      </div>
      {trailing}
    </div>
  );
}
