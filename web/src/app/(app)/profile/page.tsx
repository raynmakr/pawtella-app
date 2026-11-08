import type { Metadata } from "next";
import { UserRoundIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

// Placeholder: Web B/C/D replaces this
export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader eyebrow="You" title="Profile" description="Your pets, posts, points and orders in one place." />
      <EmptyState icon={<UserRoundIcon />} title="Coming together" description="Pets carousel, points history, orders and settings shortcuts land here." />
    </>
  );
}
