import type { Metadata } from "next";
import { PartnerDetail } from "@/components/partners/partner-detail";

export const metadata: Metadata = { title: "Partner" };

export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PartnerDetail id={id} />;
}
