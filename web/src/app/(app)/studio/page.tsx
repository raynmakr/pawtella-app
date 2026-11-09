import type { Metadata } from "next";
import { StudioScreen } from "@/components/studio/studio-screen";

export const metadata: Metadata = { title: "AI Studio" };

// Dynamic route (the (app) layout reads cookies), so useSearchParams needs no Suspense boundary.
export default function StudioPage() {
  return <StudioScreen />;
}
