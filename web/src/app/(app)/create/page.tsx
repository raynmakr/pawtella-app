import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { CreateHub } from "@/components/create/create-hub";

export const metadata: Metadata = { title: "Create" };

export default function CreatePage() {
  return (
    <>
      <PageHeader eyebrow="Share" title="Create" description="Post a photo or video of your pet for the pack." />
      <CreateHub />
    </>
  );
}
