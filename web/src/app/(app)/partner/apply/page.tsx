import type { Metadata } from "next";
import { PartnerApply } from "@/components/partners/partner-apply";

export const metadata: Metadata = { title: "Become a partner" };

export default function PartnerApplyPage() {
  return <PartnerApply />;
}
