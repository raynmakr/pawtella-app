import type { Metadata } from "next";
import { MessageCircleHeartIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

// Placeholder: Web B/C/D replaces this
export const metadata: Metadata = { title: "Ask" };

export default function AskPage() {
  return (
    <>
      <PageHeader eyebrow="Assistant" title="Ask" description="Questions about health, habits and what to buy. Answers that know your pet." />
      <EmptyState icon={<MessageCircleHeartIcon />} title="Coming together" description="The assistant chat lands here: pet selector, photo attach, vet-alert cards and product chips." />
    </>
  );
}
