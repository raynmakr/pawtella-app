"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CameraIcon, CatIcon, DogIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo, PawIcon } from "@/components/logo";
import { FormField } from "@/components/auth/form-field";
import { petsService } from "@/services/pets";
import { uploadFile } from "@/services/upload";
import { useSession } from "@/stores/session";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatPoints } from "@/lib/format";
import { markOnboarded } from "@/app/onboarding/actions";
import { Confetti } from "./confetti";

const schema = z.object({
  name: z.string().trim().min(1, "What's their name?").max(40),
  species: z.enum(["dog", "cat"], { message: "Pick dog or cat" }),
  breed: z.string().trim().max(60).optional(),
  birthday: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date")
    .refine((v) => !v || Date.parse(v) <= Date.now(), "That's in the future"),
  weightKg: z
    .string()
    .optional()
    .refine((v) => !v || (Number(v) > 0 && Number(v) <= 200), "Between 0 and 200 kg"),
});
type Values = z.infer<typeof schema>;

export function AddPetFlow() {
  const router = useRouter();
  const { user, pets, refresh } = useSession();
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [done, setDone] = useState<{ name: string; points: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", species: undefined as unknown as "dog", breed: "", birthday: "", weightKg: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const isFirstPet = pets.length === 0;

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto({ file, preview: URL.createObjectURL(file) });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      let photoUrl: string | undefined;
      if (photo) {
        const asset = await uploadFile(photo.file, { kind: "image", folder: "pets" });
        photoUrl = asset.secureUrl || asset.url;
      }
      const res = await petsService.create({
        name: values.name,
        species: values.species,
        breed: values.breed || null,
        birthday: values.birthday || null,
        weightKg: values.weightKg ? Number(values.weightKg) : null,
        photoUrl: photoUrl ?? null,
      });
      const session = await refresh();
      setDone({ name: res.pet.name, points: session.user?.pawPoints ?? user?.pawPoints ?? 30 });
    } catch (err) {
      form.setError("root", { message: errorMessage(err, "Could not save your pet") });
    }
  });

  const onContinue = () => {
    startTransition(async () => {
      await markOnboarded();
      router.push("/home");
      router.refresh();
    });
  };

  if (done) {
    return (
      <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
        <Confetti />
        <div className="animate-pop-in flex size-32 items-center justify-center rounded-[2.5rem] bg-points text-points-foreground shadow-[0_20px_50px_-20px_var(--points)]">
          <PawIcon className="size-16" />
        </div>
        <p className="mt-8 text-sm font-semibold tracking-wider text-primary uppercase">Welcome, {done.name}!</p>
        <h1 className="mt-2 text-balance text-4xl sm:text-5xl">
          You&apos;ve got <span className="text-points-foreground dark:text-points">{formatPoints(done.points)} Paw Points</span>
        </h1>
        <p className="mt-3 max-w-sm text-balance text-muted-foreground">
          Spend them in the AI Studio or at checkout. Earn more by posting, inviting friends and shopping.
        </p>
        <Button size="xl" className="mt-10 w-full max-w-xs" onClick={onContinue} disabled={pending}>
          {pending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <SparklesIcon data-icon="inline-start" />}
          Continue
        </Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center sm:py-12">
      <Link href="/home" aria-label="Pawtella" className="mb-8">
        <Logo size="md" />
      </Link>
      <div className="w-full max-w-lg rounded-card bg-card p-6 shadow-soft ring-1 ring-border sm:p-8">
        <p className="text-xs font-semibold tracking-wider text-primary uppercase">{isFirstPet ? "Step 1 of 1" : "Add a pet"}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl">{isFirstPet ? "Tell us about your pet" : "Another family member?"}</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">We use this to personalise advice, captions and product picks.</p>

        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-5">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-coral-soft text-primary ring-1 ring-border transition hover:ring-primary/50"
              aria-label="Add a photo"
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.preview} alt="" className="size-full object-cover" />
              ) : (
                <CameraIcon className="size-8" />
              )}
            </button>
            <div>
              <p className="font-heading font-bold">Photo</p>
              <p className="text-sm text-muted-foreground">Optional, but it makes the AI Studio much more fun.</p>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}>
                {photo ? "Change photo" : "Choose photo"}
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onPickPhoto} />
            </div>
          </div>

          <FormField label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" placeholder="Mochi" autoComplete="off" aria-invalid={!!errors.name} {...form.register("name")} />
          </FormField>

          <Controller
            control={form.control}
            name="species"
            render={({ field }) => (
              <FormField label="Species" htmlFor="species-dog" error={errors.species?.message}>
                <div role="radiogroup" className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { value: "dog", label: "Dog", Icon: DogIcon },
                      { value: "cat", label: "Cat", Icon: CatIcon },
                    ] as const
                  ).map(({ value, label, Icon }) => {
                    const selected = field.value === value;
                    return (
                      <button
                        key={value}
                        id={`species-${value}`}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => field.onChange(value)}
                        className={cn(
                          "flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 font-heading text-sm font-bold transition",
                          selected
                            ? "border-primary bg-coral-soft text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-7" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </FormField>
            )}
          />

          <FormField label="Breed" htmlFor="breed" error={errors.breed?.message} description="Optional">
            <Input id="breed" placeholder="Golden Retriever, Tabby, mix…" {...form.register("breed")} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Birthday" htmlFor="birthday" error={errors.birthday?.message}>
              <Input id="birthday" type="date" max={new Date().toISOString().slice(0, 10)} {...form.register("birthday")} />
            </FormField>
            <FormField label="Weight (kg)" htmlFor="weightKg" error={errors.weightKg?.message}>
              <Input id="weightKg" type="number" inputMode="decimal" step="0.1" min="0" placeholder="4.5" {...form.register("weightKg")} />
            </FormField>
          </div>

          {errors.root?.message && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {errors.root.message}
            </p>
          )}

          <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
            {isSubmitting ? "Saving…" : "Save my pet"}
          </Button>
          {!isFirstPet && (
            <Button type="button" variant="ghost" className="w-full" nativeButton={false} render={<Link href="/home" />}>
              Not now
            </Button>
          )}
        </form>
      </div>
    </main>
  );
}
