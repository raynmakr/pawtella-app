import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { loadLegalDoc } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Politique d'expédition",
  description: "Comment Pawtella expédie, livre et offre la cueillette au Canada et aux États-Unis.",
  alternates: {
    canonical: "/fr/shipping",
    languages: { "en-CA": "/shipping", "fr-CA": "/fr/shipping", "x-default": "/shipping" },
  },
};

export default function ShippingPageFr() {
  return <LegalDoc doc={loadLegalDoc("shipping", "fr")} slug="shipping" />;
}
