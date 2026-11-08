import type { Metadata } from "next";
import { SparklesIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

// Placeholder: Web B/C/D replaces this
export const metadata: Metadata = { title: "Create" };

export default function CreatePage() {
  return (
    <>
      <PageHeader eyebrow="Studio" title="Create" description="Post a photo or video, or make something new in the AI Studio." />
      <EmptyState icon={<SparklesIcon />} title="Coming together" description="The create hub lands here: post composer and AI Studio presets." />
    </>
  );
}
