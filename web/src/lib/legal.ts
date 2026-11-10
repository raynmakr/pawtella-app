import GithubSlugger from "github-slugger";
import { LEGAL_CONTENT } from "./legal-content";

// Keep in sync with the server's lib/legal.js. Displayed/stored version markers.
export const TERMS_VERSION = "1.0";
export const PRIVACY_VERSION = "1.0";

export type LegalDocId = "terms" | "privacy";

export interface TocItem {
  id: string;
  text: string;
}

export interface LoadedLegalDoc {
  title: string;
  markdown: string;
  toc: TocItem[];
}

const FALLBACK_TITLE: Record<LegalDocId, string> = {
  terms: "Terms of Use",
  privacy: "Privacy Policy",
};

/**
 * Read a legal document's markdown from content/legal and derive a table of contents from its
 * level-2 headings. Slugs are produced with github-slugger so they match the ids rehype-slug adds
 * to the rendered headings, making the TOC links resolve.
 */
export function loadLegalDoc(doc: LegalDocId): LoadedLegalDoc {
  const markdown = LEGAL_CONTENT[doc];
  const lines = markdown.split("\n");

  const title = (lines.find((l) => l.startsWith("# "))?.slice(2) ?? FALLBACK_TITLE[doc]).trim();

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
  return { title, markdown, toc };
}
