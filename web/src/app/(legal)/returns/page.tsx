import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { loadLegalDoc } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Returns & Refunds Policy",
  description: "How returns, refunds and Paw Points work on Pawtella orders.",
  alternates: {
    canonical: "/returns",
    languages: { "en-CA": "/returns", "fr-CA": "/fr/returns", "x-default": "/returns" },
  },
};

export default function ReturnsPage() {
  return <LegalDoc doc={loadLegalDoc("returns", "en")} slug="returns" />;
}
