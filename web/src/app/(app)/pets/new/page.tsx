import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PetForm } from "@/components/pets/pet-form";

export const metadata: Metadata = { title: "Add a pet" };

export default function NewPetPage() {
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <PageHeader eyebrow="Pets" title="Add a pet" description="Tell us about them. You can always edit this later." />
      <PetForm />
    </div>
  );
}
