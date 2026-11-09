import type { Metadata } from "next";
import { PartnerDashboard } from "@/components/partners/partner-dashboard";

export const metadata: Metadata = { title: "Partner dashboard" };

export default function PartnerDashboardPage() {
  return <PartnerDashboard />;
}
