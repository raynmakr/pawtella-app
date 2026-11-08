import type { Metadata } from "next";
import { GenerationHistory } from "@/components/studio/generation-history";

export const metadata: Metadata = { title: "Your creations" };

export default function StudioHistoryPage() {
  return <GenerationHistory />;
}
