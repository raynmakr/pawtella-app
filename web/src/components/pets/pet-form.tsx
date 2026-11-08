"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CameraIcon, CatIcon, DogIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/auth/form-field";
import { PetAvatar } from "@/components/avatars";
import { petsService } from "@/services/pets";
import { uploadFile } from "@/services/upload";
import { useSession } from "@/stores/session";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Pet, PetSex } from "@/types/pet";

const schema = z.object({
  name: z.string().trim().min(1, "What's their name?").max(40, "Keep it under 40 characters"),
  species: z.enum(["dog", "cat"], { message: "Pick dog or cat" }),
  breed: z.string().trim().max(60, "Keep it under 60 characters").optional(),
  sex: z.enum(["male", "female", "unknown"]).optional(),
  birthday: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date")
    .refine((v) => !v || Date.parse(v) <= Date.now(), "That's in the future"),
  weightKg: z
    .string()
    .optional()
    .refine((v) => !v || (Number(v) > 0 && Number(v) <= 200), "Between 0 and 200 kg"),
  notes: z.string().trim().max(2000, "Keep it under 2000 characters").optional(),
  isPrimary: z.boolean().optional(),
});
type Values = z.infer<typeof schema>;

const SEXES: Array<{ value: PetSex; label: string }> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "unknown", label: "Prefer not to say" },
];

export function PetForm({ pet }: { pet?: Pet }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { refresh, pets } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEdit = !!pet;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: pet?.name ?? "",
      species: pet?.species ?? (undefined as unknown as "dog"),
      breed: pet?.breed ?? "",
      sex: pet?.sex ?? undefined,
      birthday: pet?.birthday ?? "",
      weightKg: pet?.weightKg != null ? String(pet.weightKg) : "",
      notes: pet?.notes ?? "",
      isPrimary: pet?.isPrimary ?? false,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const species = useWatch({ control: form.control, name: "species" });
  const name = useWatch({ control: form.control, name: "name" });
  const sexValue = useWatch({ control: form.control, name: "sex" });
  const isPrimaryValue = useWatch({ control: form.control, name: "isPrimary" });
  const currentPhoto = photo?.preview ?? (removePhoto ? null : pet?.photoUrl ?? null);

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto({ file, preview: URL.createObjectURL(file) });
    setRemovePhoto(false);
  };

  const invalidate = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: queryKeys.pets.all }), qc.invalidateQueries({ queryKey: queryKeys.me }), refresh()]);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      let photoUrl: string | null | undefined = undefined;
      if (photo) {
        const asset = await uploadFile(photo.file, { kind: "image", folder: "pets" });
        photoUrl = asset.secureUrl || asset.url;
      } else if (removePhoto) {
        photoUrl = null;
      }
      const payload = {
        name: values.name,
        species: values.species,
        breed: values.breed || null,
        sex: values.sex ?? null,
        birthday: values.birthday || null,
        weightKg: values.weightKg ? Number(values.weightKg) : null,
        notes: values.notes || null,
        ...(photoUrl !== undefined ? { photoUrl } : {}),
        ...(values.isPrimary !== undefined ? { isPrimary: values.isPrimary } : {}),
      };
      if (isEdit) {
        await petsService.update(pet.id, payload);
        await invalidate();
        toast.success(`${values.name} updated`);
        router.push(`/pets/${pet.id}`);
      } else {
        const res = await petsService.create({ ...payload, photoUrl: photoUrl ?? null });
        await invalidate();
        toast.success(res.bonusAwarded ? `${values.name} added. Bonus Paw Points unlocked!` : `${values.name} added to your family`);
        router.push(`/pets/${res.pet.id}`);
      }
      router.refresh();
    } catch (err) {
      form.setError("root", { message: errorMessage(err, "Could not save your pet") });
    }
  });

  const onDelete = async () => {
    if (!pet) return;
    setDeleting(true);
    try {
      await petsService.remove(pet.id);
      await invalidate();
      toast.success(`${pet.name} removed`);
      router.push("/profile");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove this pet"));
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} className="group relative rounded-full" aria-label={currentPhoto ? "Change photo" : "Add photo"}>
          <PetAvatar src={currentPhoto} name={name || "Pet"} species={species ?? null} size="2xl" className="ring-4 ring-coral-soft" />
          <span className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft ring-4 ring-background transition group-hover:scale-105">
            <CameraIcon className="size-4" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onPickPhoto} />
        {currentPhoto && (
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { if (photo) URL.revokeObjectURL(photo.preview); setPhoto(null); setRemovePhoto(true); }}>
            Remove photo
          </Button>
        )}
      </div>

      <section className="grid gap-5 rounded-card bg-card p-4 shadow-soft ring-1 ring-border sm:p-6">
        <FormField label="Name" htmlFor="pet-name" error={errors.name?.message}>
          <Input id="pet-name" placeholder="Luna" autoComplete="off" {...form.register("name")} aria-invalid={!!errors.name} />
        </FormField>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Species</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(["dog", "cat"] as const).map((s) => {
              const selected = species === s;
              const Icon = s === "dog" ? DogIcon : CatIcon;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => form.setValue("species", s, { shouldValidate: true })}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold ring-1 transition",
                    selected ? "bg-coral-soft text-primary ring-primary/40" : "bg-background ring-border hover:bg-muted",
                  )}
                >
                  <Icon className="size-5" /> {s === "dog" ? "Dog" : "Cat"}
                </button>
              );
            })}
          </div>
          {errors.species && <p className="mt-1.5 text-sm text-destructive">{errors.species.message}</p>}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Breed" htmlFor="pet-breed" error={errors.breed?.message}>
            <Input id="pet-breed" placeholder={species === "cat" ? "Tabby" : "Golden Retriever"} {...form.register("breed")} />
          </FormField>
          <FormField label="Sex" htmlFor="pet-sex" error={errors.sex?.message}>
            <Select value={sexValue ?? null} onValueChange={(v) => form.setValue("sex", (v as PetSex) ?? undefined)} items={SEXES}>
              <SelectTrigger id="pet-sex" className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {SEXES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Birthday" htmlFor="pet-birthday" error={errors.birthday?.message}>
            <Input id="pet-birthday" type="date" max={new Date().toISOString().slice(0, 10)} {...form.register("birthday")} />
          </FormField>
          <FormField label="Weight (kg)" htmlFor="pet-weight" error={errors.weightKg?.message}>
            <Input id="pet-weight" type="number" inputMode="decimal" step="0.1" min="0" max="200" placeholder="12.5" {...form.register("weightKg")} />
          </FormField>
        </div>

        <FormField label="Notes" htmlFor="pet-notes" error={errors.notes?.message} description="Allergies, quirks, favourite treats. The pet assistant reads these.">
          <Textarea id="pet-notes" rows={3} placeholder="Loves tennis balls, allergic to chicken" {...form.register("notes")} />
        </FormField>

        {(pets.length > (isEdit ? 1 : 0)) && (
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-muted/60 px-4 py-3">
            <span>
              <span className="block text-[15px] font-semibold">Primary pet</span>
              <span className="block text-sm text-muted-foreground">Shown first and used by default in Studio and Ask.</span>
            </span>
            <Switch checked={!!isPrimaryValue} onCheckedChange={(v) => form.setValue("isPrimary", Boolean(v))} disabled={pet?.isPrimary} />
          </label>
        )}
      </section>

      {errors.root && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {errors.root.message}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {isEdit ? (
          <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon data-icon="inline-start" /> Remove {pet.name}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
            {isEdit ? "Save changes" : "Add pet"}
          </Button>
        </div>
      </div>

      {isEdit && (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="rounded-card p-5">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Remove {pet.name}?</DialogTitle>
              <DialogDescription>Their profile, notes and photo are deleted. Posts that tag {pet.name} stay up without the tag.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="rounded-b-card">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                Keep
              </Button>
              <Button variant="destructive" onClick={onDelete} disabled={deleting}>
                {deleting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </form>
  );
}
