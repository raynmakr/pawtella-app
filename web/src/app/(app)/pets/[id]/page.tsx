import type { Metadata } from "next";
import { PetDetail } from "@/components/pets/pet-detail";

export const metadata: Metadata = { title: "Pet" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PetPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <PetDetail id={id} edit={sp.edit === "1" || sp.edit === "true"} />;
}
