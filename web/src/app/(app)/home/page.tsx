import type { Metadata } from "next";
import { HouseIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

// Placeholder: Web B/C/D replaces this
export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <>
      <PageHeader eyebrow="Feed" title="Home" description="Photos and AI videos from pets you follow, plus the week's challenge." />
      <EmptyState icon={<HouseIcon />} title="Coming together" description="The feed lands here: Following and Discover tabs, challenge banner, double-tap to like." />
    </>
  );
}
