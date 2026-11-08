import type { Metadata } from "next";
import { ShoppingBagIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

// Placeholder: Web B/C/D replaces this
export const metadata: Metadata = { title: "Shop" };

export default function ShopPage() {
  return (
    <>
      <PageHeader eyebrow="Supplies" title="Shop" description="Food, toys and treats. Pickup from our Toronto depot or local delivery." />
      <EmptyState icon={<ShoppingBagIcon />} title="Coming together" description="Collections, search with an ask-AI mode, product grid and cart land here." />
    </>
  );
}
