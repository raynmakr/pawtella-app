import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { loadLegalDoc } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Politique de retour et de remboursement",
  description: "Le fonctionnement des retours, des remboursements et des points Paw chez Pawtella.",
  alternates: {
    canonical: "/fr/returns",
    languages: { "en-CA": "/returns", "fr-CA": "/fr/returns", "x-default": "/returns" },
  },
};

export default function ReturnsPageFr() {
  return <LegalDoc doc={loadLegalDoc("returns", "fr")} slug="returns" />;
}
