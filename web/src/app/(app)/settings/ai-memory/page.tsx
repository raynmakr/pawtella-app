import type { Metadata } from "next";
import { AiMemoryScreen } from "@/components/settings/ai-memory-screen";

export const metadata: Metadata = { title: "What Pawtella AI remembers" };

export default function AiMemoryPage() {
  return <AiMemoryScreen />;
}
