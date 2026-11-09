"use client";

import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { PetAvatar } from "@/components/avatars";
import { petAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicPet } from "@/types/pet";

interface PetsCarouselProps {
  pets: PublicPet[];
  /** Owner view: cards link to /pets/[id] and there is an "Add pet" card. */
  editable?: boolean;
  className?: string;
}

export function PetsCarousel({ pets, editable, className }: PetsCarouselProps) {
  if (pets.length === 0 && !editable) return null;
  return (
    <div className={cn("-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {pets.map((pet) => {
        const age = petAge(pet.birthday);
        const inner = (
          <>
            <PetAvatar src={pet.photoUrl} name={pet.name} species={pet.species} size="lg" />
            <span className="min-w-0">
              <span className="block truncate font-heading text-base font-bold">{pet.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {[pet.breed ?? (pet.species === "cat" ? "Cat" : "Dog"), age].filter(Boolean).join(" · ")}
              </span>
            </span>
          </>
        );
        const cls = "flex w-[200px] shrink-0 snap-start items-center gap-3 rounded-card bg-card p-3 ring-1 ring-border transition hover:ring-primary/40";
        return editable ? (
          <Link key={pet.id} href={`/pets/${pet.id}`} className={cls}>
            {inner}
          </Link>
        ) : (
          <div key={pet.id} className={cls}>
            {inner}
          </div>
        );
      })}
      {editable && (
        <Link
          href="/pets/new"
          className="flex w-[160px] shrink-0 snap-start items-center justify-center gap-2 rounded-card border-2 border-dashed border-border p-3 text-sm font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary"
        >
          <PlusIcon className="size-5" /> Add pet
        </Link>
      )}
    </div>
  );
}
