import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { Components } from "react-markdown";
import type { LoadedLegalDoc } from "@/lib/legal";
import { cn } from "@/lib/utils";

/* react-markdown hands each component an AST `node` prop; we destructure it out so it never lands
   on the DOM element, which is the only reason these `node` bindings go unused. */
/* eslint-disable @typescript-eslint/no-unused-vars */
// Explicit, readable typography (no prose plugin dependency). Tuned for comfortable reading on a
// phone: generous line-height, clear heading hierarchy, wrapped tables and links.
const components: Components = {
  h1: ({ node, ...p }) => <h1 className="scroll-mt-24 text-[26px] font-bold leading-tight tracking-tight sm:text-3xl" {...p} />,
  h2: ({ node, ...p }) => (
    <h2 className="scroll-mt-24 border-t border-border pt-7 text-xl font-semibold leading-snug sm:text-2xl" {...p} />
  ),
  h3: ({ node, ...p }) => <h3 className="scroll-mt-24 text-lg font-semibold" {...p} />,
  p: ({ node, ...p }) => <p className="text-[15px] leading-relaxed text-foreground/90" {...p} />,
  ul: ({ node, ...p }) => <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-foreground/90 marker:text-muted-foreground" {...p} />,
  ol: ({ node, ...p }) => <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-foreground/90 marker:text-muted-foreground" {...p} />,
  li: ({ node, ...p }) => <li className="pl-1" {...p} />,
  a: ({ node, ...p }) => <a className="font-medium text-primary underline underline-offset-2 break-words" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
  hr: ({ node, ...p }) => <hr className="border-border" {...p} />,
  blockquote: ({ node, ...p }) => (
    <blockquote className="rounded-r-lg border-l-2 border-primary/40 bg-primary/5 px-4 py-3 text-[15px] leading-relaxed text-foreground/90 [&>p]:my-1.5" {...p} />
  ),
  table: ({ node, ...p }) => (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm" {...p} />
    </div>
  ),
  th: ({ node, ...p }) => <th className="border border-border bg-muted px-3 py-2 align-top font-semibold" {...p} />,
  td: ({ node, ...p }) => <td className="border border-border px-3 py-2 align-top text-foreground/90" {...p} />,
};
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * The companion-language route for each legal document, so the language toggle can link the
 * English and French versions of the same page to each other.
 */
const ALT_HREF: Record<"terms" | "privacy", { en: string; fr: string }> = {
  terms: { en: "/terms", fr: "/fr/terms" },
  privacy: { en: "/privacy", fr: "/fr/privacy" },
};

export function LegalDoc({ doc, slug }: { doc: LoadedLegalDoc; slug: "terms" | "privacy" }) {
  const isFr = doc.locale === "fr";
  const hrefs = ALT_HREF[slug];
  const onPage = isFr ? "Dans cette page" : "On this page";

  return (
    <div lang={isFr ? "fr-CA" : undefined} className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div
        aria-label={isFr ? "Langue" : "Language"}
        className="mb-6 inline-flex items-center gap-1 rounded-full bg-card p-1 text-sm font-medium shadow-soft ring-1 ring-border"
      >
        <Link
          href={hrefs.en}
          hrefLang="en-CA"
          aria-current={!isFr ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            !isFr ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-primary",
          )}
        >
          English
        </Link>
        <Link
          href={hrefs.fr}
          hrefLang="fr-CA"
          aria-current={isFr ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            isFr ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-primary",
          )}
        >
          Français
        </Link>
      </div>
      <nav aria-label={onPage} className="mb-8 rounded-card bg-card p-4 shadow-soft ring-1 ring-border">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{onPage}</p>
        <ol className="grid gap-1 sm:grid-cols-2">
          {doc.toc.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} className="block rounded px-1 py-0.5 text-sm text-foreground/80 hover:text-primary hover:underline">
                {item.text}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="space-y-4 [&_h2+p]:mt-3 [&_h2]:mt-0 [&>h1]:mb-4">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
          {doc.markdown}
        </Markdown>
      </article>
    </div>
  );
}
