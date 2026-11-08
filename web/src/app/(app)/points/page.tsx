import type { Metadata } from "next";
import { CoinsIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

// Placeholder: Web B/C/D replaces this
export const metadata: Metadata = { title: "Paw Points" };

export default function PointsPage() {
  return (
    <>
      <PageHeader eyebrow="Rewards" title="Paw Points" description="Earn by posting, inviting friends and shopping. Spend in the Studio or at checkout." />
      <EmptyState icon={<CoinsIcon />} title="Coming together" description="Balance, ways to earn, buy packs and history land here." />
    </>
  );
}
