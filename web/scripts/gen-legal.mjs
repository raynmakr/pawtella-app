// Generate src/lib/legal-content.ts from the markdown source of truth in content/legal, so the
// legal text is bundled into the build (no runtime fs / working-directory assumptions). Runs
// automatically before `build` (npm "prebuild"); re-run by hand after editing the markdown.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// English source docs plus their Canadian French (fr-CA) counterparts (<doc>.fr.md), bundled under
// the key "<doc>.fr" so the French legal routes can render them without runtime fs access.
const docs = ["terms", "privacy", "shipping", "returns"];
const keys = [...docs, ...docs.map((d) => `${d}.fr`)];

const entries = keys
  .map((key) => {
    const file = `${key}.md`;
    const md = readFileSync(path.join(root, "content", "legal", file), "utf8");
    return `  ${JSON.stringify(key)}: ${JSON.stringify(md)},`;
  })
  .join("\n");

const unionType = keys.map((k) => JSON.stringify(k)).join(" | ");

const out = `// AUTO-GENERATED from content/legal/*.md by scripts/gen-legal.mjs. Do not edit by hand.
export const LEGAL_CONTENT: Record<${unionType}, string> = {
${entries}
};
`;

writeFileSync(path.join(root, "src", "lib", "legal-content.ts"), out);
console.log("[gen-legal] wrote src/lib/legal-content.ts");
