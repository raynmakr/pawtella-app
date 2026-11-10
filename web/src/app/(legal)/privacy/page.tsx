import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { loadLegalDoc } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Pawtella collects, uses and protects your personal information.",
  alternates: {
    canonical: "/privacy",
    languages: { "en-CA": "/privacy", "fr-CA": "/fr/privacy", "x-default": "/privacy" },
  },
};

export default function PrivacyPage() {
  return <LegalDoc doc={loadLegalDoc("privacy", "en")} slug="privacy" />;
}
