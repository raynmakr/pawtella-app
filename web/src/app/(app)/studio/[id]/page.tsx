import type { Metadata } from "next";
import { GenerationScreen } from "@/components/studio/generation-screen";

export const metadata: Metadata = { title: "Your creation" };

export default async function GenerationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GenerationScreen id={id} />;
}
