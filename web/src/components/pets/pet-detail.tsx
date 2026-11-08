"use client";

import Link from "next/link";
import { ArrowLeftIcon, CakeIcon, PencilIcon, ScaleIcon, StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { PetAvatar } from "@/components/avatars";
import { usePet } from "@/hooks/use-profile";
import { isApiError } from "@/lib/api";
import { petAge } from "@/lib/format";
import { PetForm } from "./pet-form";

function formatBirthday(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { dateStyle: "long" }).format(new Date(`${iso}T12:00:00`));
  } catch {
    return iso;
  }
}

export function PetDetail({ id, edit }: { id: string; edit?: boolean }) {
  const q = usePet(id);
  if (q.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <EmptyState
          title="Pet not found"
          description="This pet isn't in your family, or it was removed."
          action={
            <Button nativeButton={false} render={<Link href="/profile" />}>
              Back to profile
            </Button>
          }
        />
      );
    }
    return <ErrorState title="Couldn't load this pet" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }
  const { pet } = q.data;
  const age = petAge(pet.birthday);

  if (edit) {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <PageHeader eyebrow="Pets" title={`Edit ${pet.name}`} description="Keep their details up to date so the pet assistant gives better answers." />
        <PetForm pet={pet} />
      </div>
    );
  }

  const facts = [
    { Icon: CakeIcon, label: "Birthday", value: pet.birthday ? `${formatBirthday(pet.birthday)}${age ? ` (${age})` : ""}` : null },
    { Icon: ScaleIcon, label: "Weight", value: pet.weightKg != null ? `${pet.weightKg} kg` : null },
    { Icon: StarIcon, label: "Sex", value: pet.sex && pet.sex !== "unknown" ? pet.sex[0].toUpperCase() + pet.sex.slice(1) : null },
  ].filter((f) => f.value);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" nativeButton={false} render={<Link href="/profile" />}>
          <ArrowLeftIcon data-icon="inline-start" /> Profile
        </Button>
      </div>
      <header className="flex flex-col items-center gap-4 rounded-card bg-card p-6 text-center shadow-soft ring-1 ring-border">
        <PetAvatar src={pet.photoUrl} name={pet.name} species={pet.species} size="2xl" className="ring-4 ring-coral-soft" />
        <div>
          <h1 className="text-3xl">{pet.name}</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {[pet.breed ?? (pet.species === "cat" ? "Cat" : "Dog"), pet.species === "cat" ? "cat" : "dog", age].filter(Boolean).join(" · ")}
          </p>
          {pet.isPrimary && <span className="mt-2 inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-xs font-bold text-points-foreground dark:text-points">Primary pet</span>}
        </div>
        <Button variant="outline" nativeButton={false} render={<Link href={`/pets/${pet.id}?edit=1`} />}>
          <PencilIcon data-icon="inline-start" /> Edit details
        </Button>
      </header>

      {facts.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label} className="flex items-center gap-3 rounded-card bg-card p-4 ring-1 ring-border">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-teal-soft text-secondary">
                <f.Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="truncate text-[15px] font-semibold">{f.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}

      <section className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
        <h2 className="text-lg">Notes</h2>
        {pet.notes ? (
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{pet.notes}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No notes yet. Add allergies, routines or quirks so the pet assistant can tailor its answers.{" "}
            <Link href={`/pets/${pet.id}?edit=1`} className="font-semibold text-primary hover:underline">
              Add notes
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
