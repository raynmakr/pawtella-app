import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { loadLegalDoc } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms that govern your use of Pawtella.",
};

export default function TermsPage() {
  return <LegalDoc doc={loadLegalDoc("terms")} />;
}
