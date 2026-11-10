import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { loadLegalDoc } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Comment Pawtella recueille, utilise et protège vos renseignements personnels.",
  alternates: {
    canonical: "/fr/privacy",
    languages: { "en-CA": "/privacy", "fr-CA": "/fr/privacy", "x-default": "/privacy" },
  },
};

export default function PrivacyPageFr() {
  return <LegalDoc doc={loadLegalDoc("privacy", "fr")} slug="privacy" />;
}
