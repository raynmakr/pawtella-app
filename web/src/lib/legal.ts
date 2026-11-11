import GithubSlugger from "github-slugger";
import { LEGAL_CONTENT } from "./legal-content";

// Keep in sync with the server's lib/legal.js. Displayed/stored version markers.
export const TERMS_VERSION = "1.0";
export const PRIVACY_VERSION = "1.0";

export type LegalDocId = "terms" | "privacy" | "shipping" | "returns";
export type LegalLocale = "en" | "fr";

export interface TocItem {
  id: string;
  text: string;
}

export interface LoadedLegalDoc {
  title: string;
  markdown: string;
  toc: TocItem[];
  locale: LegalLocale;
}

const FALLBACK_TITLE: Record<LegalLocale, Record<LegalDocId, string>> = {
  en: {
    terms: "Terms of Use",
    privacy: "Privacy Policy",
    shipping: "Shipping Policy",
    returns: "Returns & Refunds Policy",
  },
  fr: {
    terms: "Conditions d'utilisation",
    privacy: "Politique de confidentialité",
    shipping: "Politique d'expédition",
    returns: "Politique de retour et de remboursement",
  },
};

/**
 * Read a legal document's markdown from content/legal and derive a table of contents from its
 * level-2 headings. Slugs are produced with github-slugger so they match the ids rehype-slug adds
 * to the rendered headings, making the TOC links resolve. `locale` selects the English source or
 * its Canadian French (fr-CA) translation, bundled under the "<doc>.fr" key.
 */
export function loadLegalDoc(doc: LegalDocId, locale: LegalLocale = "en"): LoadedLegalDoc {
  const key = locale === "fr" ? (`${doc}.fr` as const) : doc;
  const markdown = LEGAL_CONTENT[key];
  const lines = markdown.split("\n");

  const title = (lines.find((l) => l.startsWith("# "))?.slice(2) ?? FALLBACK_TITLE[locale][doc]).trim();

  const slugger = new GithubSlugger();
  const toc: TocItem[] = [];
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      const text = m[1].trim();
      toc.push({ id: slugger.slug(text), text });
    }
  }
  return { title, markdown, toc, locale };
}
