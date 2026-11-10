import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { loadLegalDoc } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description: "Les conditions qui régissent votre utilisation de Pawtella.",
  alternates: {
    canonical: "/fr/terms",
    languages: { "en-CA": "/terms", "fr-CA": "/fr/terms", "x-default": "/terms" },
  },
};

export default function TermsPageFr() {
  return <LegalDoc doc={loadLegalDoc("terms", "fr")} slug="terms" />;
}
