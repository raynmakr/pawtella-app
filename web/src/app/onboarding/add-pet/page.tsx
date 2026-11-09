import type { Metadata } from "next";
import { AddPetFlow } from "@/components/onboarding/add-pet-flow";

export const metadata: Metadata = { title: "Add your pet" };

export default function AddPetPage() {
  return <AddPetFlow />;
}
