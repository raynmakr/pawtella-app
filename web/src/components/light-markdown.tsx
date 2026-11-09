import { cn } from "@/lib/utils";

/** Inline: **bold**, *italic*, `code`. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { type: "p"; lines: string[] } | { type: "ul"; items: string[] } | { type: "ol"; items: string[] } | { type: "h"; text: string };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let cur: Block | null = null;
  const flush = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: "h", text: h[1] });
    } else if (ul) {
      if (cur?.type !== "ul") {
        flush();
        cur = { type: "ul", items: [] };
      }
      (cur as { items: string[] }).items.push(ul[1]);
    } else if (ol) {
      if (cur?.type !== "ol") {
        flush();
        cur = { type: "ol", items: [] };
      }
      (cur as { items: string[] }).items.push(ol[1]);
    } else {
      if (cur?.type !== "p") {
        flush();
        cur = { type: "p", lines: [] };
      }
      (cur as { lines: string[] }).lines.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** Renders a safe subset of Markdown (paragraphs, bold/italic/code, bulleted and numbered lists, small headings). */
export function LightMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks = parse(text);
  return (
    <div className={cn("space-y-2.5 text-[15px] leading-relaxed [&_strong]:font-semibold", className)}>
      {blocks.map((b, i) => {
        if (b.type === "h") return <p key={i} className="font-heading font-bold">{renderInline(b.text, `h${i}`)}</p>;
        if (b.type === "ul")
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.items.map((it, j) => <li key={j}>{renderInline(it, `u${i}-${j}`)}</li>)}
            </ul>
          );
        if (b.type === "ol")
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {b.items.map((it, j) => <li key={j}>{renderInline(it, `o${i}-${j}`)}</li>)}
            </ol>
          );
        return <p key={i}>{renderInline(b.lines.join(" "), `p${i}`)}</p>;
      })}
    </div>
  );
}
