import type { Metadata } from "next";
import { PartnersDirectory } from "@/components/partners/partners-directory";

export const metadata: Metadata = { title: "Local partners" };

export default function PartnersPage() {
  return <PartnersDirectory />;
}
