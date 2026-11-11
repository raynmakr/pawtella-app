import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { loadLegalDoc } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: "How Pawtella ships, delivers and offers pickup across Canada and the US.",
  alternates: {
    canonical: "/shipping",
    languages: { "en-CA": "/shipping", "fr-CA": "/fr/shipping", "x-default": "/shipping" },
  },
};

export default function ShippingPage() {
  return <LegalDoc doc={loadLegalDoc("shipping", "en")} slug="shipping" />;
}
