"use client";

import { cn } from "@/lib/utils";
import { PetAvatar } from "./avatars";
import type { Pet } from "@/types/pet";

interface PetChipsProps {
  pets: Pet[];
  value: number | null;
  onChange: (petId: number | null) => void;
  /** Label for the "no pet" chip; omit to hide it. */
  noneLabel?: string;
  className?: string;
}

/** Horizontal row of pet chips (avatar + name). */
export function PetChips({ pets, value, onChange, noneLabel, className }: PetChipsProps) {
  return (
    <div role="radiogroup" aria-label="Pet" className={cn("-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]", className)}>
      {noneLabel && (
        <Chip active={value === null} onClick={() => onChange(null)}>
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs">✦</span>
          {noneLabel}
        </Chip>
      )}
      {pets.map((p) => (
        <Chip key={p.id} active={value === p.id} onClick={() => onChange(p.id)}>
          <PetAvatar src={p.photoUrl} name={p.name} species={p.species} size="xs" />
          {p.name}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full pr-3.5 pl-1.5 text-sm font-semibold ring-1 transition",
        active ? "bg-coral-soft text-primary ring-primary/40" : "bg-card text-foreground ring-border hover:ring-primary/30",
      )}
    >
      {children}
    </button>
  );
}
