// Generate src/lib/legal-content.ts from the markdown source of truth in content/legal, so the
// legal text is bundled into the build (no runtime fs / working-directory assumptions). Runs
// automatically before `build` (npm "prebuild"); re-run by hand after editing the markdown.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const docs = ["terms", "privacy"];

const entries = docs
  .map((doc) => {
    const md = readFileSync(path.join(root, "content", "legal", `${doc}.md`), "utf8");
    return `  ${doc}: ${JSON.stringify(md)},`;
  })
  .join("\n");

const out = `// AUTO-GENERATED from content/legal/*.md by scripts/gen-legal.mjs. Do not edit by hand.
export const LEGAL_CONTENT: Record<"terms" | "privacy", string> = {
${entries}
};
`;

writeFileSync(path.join(root, "src", "lib", "legal-content.ts"), out);
console.log("[gen-legal] wrote src/lib/legal-content.ts");
