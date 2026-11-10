import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { loadLegalDoc } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms that govern your use of Pawtella.",
};

// Rendered on demand so the markdown is read from the traced content/legal bundle at runtime
// (outputFileTracingIncludes in next.config.ts), avoiding build-time working-directory surprises.
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <LegalDoc doc={loadLegalDoc("terms")} />;
}
