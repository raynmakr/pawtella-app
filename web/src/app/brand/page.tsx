import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Logo, PawIcon } from "@/components/logo";
import { Mascot, type PipPose } from "@/components/mascot";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Brand",
  description: "Pawtella brand system: Pip the mascot, logo, colour, type and motion.",
  robots: { index: false },
};

const POSES: { pose: PipPose; label: string; use: string }[] = [
  { pose: "happy", label: "Happy", use: "Default · inviting empty states" },
  { pose: "wave", label: "Wave", use: "Welcome · auth · rewards hero" },
  { pose: "thinking", label: "Thinking", use: "Loading · AI generating" },
  { pose: "sleeping", label: "Sleeping", use: "Quiet / all-caught-up states" },
  { pose: "celebrating", label: "Celebrating", use: "Pet saved · order placed" },
  { pose: "sad", label: "Sad", use: "Errors · 404 · failed jobs" },
];

const SWATCHES: { name: string; token: string; hex: string; className: string; note?: string }[] = [
  { name: "Pawtella Coral", token: "--primary", hex: "#ff6b4a", className: "bg-primary", note: "Brand accent" },
  { name: "Coral Soft", token: "--coral-soft", hex: "#ffe6df", className: "bg-coral-soft" },
  { name: "Depot Teal", token: "--secondary", hex: "#0e7c7b", className: "bg-secondary", note: "Grounding accent" },
  { name: "Teal Soft", token: "--teal-soft", hex: "#dff3f2", className: "bg-teal-soft" },
  { name: "Paw Points Amber", token: "--points", hex: "#f5a623", className: "bg-points", note: "Points only" },
  { name: "Success Green", token: "--success", hex: "#2bb673", className: "bg-success" },
  { name: "Destructive", token: "--destructive", hex: "#e5484d", className: "bg-destructive" },
  { name: "Ink", token: "--foreground", hex: "#1f1b16", className: "bg-foreground" },
  { name: "Cream", token: "--background", hex: "#fff8f1", className: "bg-background border border-border" },
  { name: "Card White", token: "--card", hex: "#ffffff", className: "bg-card border border-border" },
  { name: "Accent", token: "--accent", hex: "#fff3dc", className: "bg-accent" },
  { name: "Border Sand", token: "--border", hex: "#eedfd3", className: "bg-border" },
];

const MOTION = [
  ["100–150ms", "Immediate feedback", "button press, badge pop"],
  ["150–300ms", "Routine state change", "hover, toggle"],
  ["300–500ms", "Overlays & page transitions", "page-in, sheets"],
  ["500–800ms", "A deliberate focal entrance", "points count-up"],
];

function Section({ id, title, kicker, children }: { id: string; title: string; kicker: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-10 border-t border-border py-12 first:border-t-0 sm:py-16">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">{kicker}</p>
      <h2 className="text-balance text-2xl sm:text-3xl">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function BrandPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      {/* Hero */}
      <header className="flex flex-col items-center gap-6 py-10 text-center sm:py-16">
        <Logo size="lg" />
        <Mascot pose="wave" float className="w-36 sm:w-44" title="Pip, the Pawtella mascot" />
        <h1 className="text-balance text-4xl sm:text-5xl">The Pawtella brand</h1>
        <p className="max-w-xl text-balance text-[15px] leading-relaxed text-muted-foreground sm:text-lg">
          Warm, rounded and pet-proud. This page renders the living system — meet Pip, the colours,
          the type and the motion. Read the full guide in <code className="rounded bg-muted px-1.5 py-0.5 text-sm">docs/BRAND_GUIDE.md</code>.
        </p>
      </header>

      {/* Mascot */}
      <Section id="mascot" kicker="Mascot" title="Pip — a cat-dog hybrid">
        <p className="mb-6 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
          One pointy cat ear, one folded dog ear — the hybrid that serves both cat people and dog
          people. A thick, round-capped deep-teal outline, a warm cream face, simple oval eyes, a cat
          &ldquo;‿‿&rdquo; smile and a small coral dot by the dog ear. Six poses, each matched to a
          moment, read through the eyes, mouth, ear tilt and a small prop. Idle blink and ear twitch
          loop subtly and stop under reduced motion.
        </p>
        <figure className="mb-6 grid items-center gap-5 rounded-card bg-card p-5 ring-1 ring-border sm:grid-cols-[180px_1fr]">
          <Image
            src="/brand/pawtella-mascot-original.png"
            alt="The original Pawtella reference mark — Pip's cat-dog face above the lowercase pawtella wordmark"
            width={180}
            height={180}
            className="mx-auto h-auto w-40 rounded-2xl sm:w-full"
          />
          <figcaption className="max-w-[48ch] text-[13px] leading-relaxed text-muted-foreground">
            <span className="font-heading text-sm font-bold text-foreground">The reference mark.</span>{" "}
            Pip and the lowercase <span className="font-semibold">pawtella</span> wordmark are rebuilt
            as a hand-authored vector in <code className="rounded bg-muted px-1 py-0.5 text-xs">web/src/components/mascot.tsx</code>,
            faithful to this original and recoloured to the palette tokens — outline and ears in Depot
            Teal, the dot in Pawtella Coral.
          </figcaption>
        </figure>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {POSES.map(({ pose, label, use }) => (
            <figure key={pose} className="flex flex-col items-center rounded-card bg-card p-5 text-center ring-1 ring-border">
              <Mascot pose={pose} className="w-28" />
              <figcaption className="mt-3">
                <span className="block font-heading text-sm font-bold">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{use}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* Logo */}
      <Section id="logo" kicker="Logo" title="Lockup & mark">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col items-start justify-center gap-5 rounded-card bg-card p-6 ring-1 ring-border">
            <Logo size="xl" />
            <Logo size="lg" />
            <Logo size="md" />
            <Logo size="sm" />
            <p className="text-xs text-muted-foreground">Sizes xl → sm. Lowercase <span className="font-semibold text-secondary">pawtella</span> in Depot Teal, scaling with the mark.</p>
          </div>
          <div className="flex flex-col items-center justify-center gap-5 rounded-card bg-foreground p-6 text-center">
            <Mascot variant="mark" className="w-20" />
            <Logo size="lg" markOnly />
            <p className="text-xs text-background/70">The head mark reads at small sizes — favicons, app icons, tight spaces.</p>
          </div>
        </div>
      </Section>

      {/* Colour */}
      <Section id="colour" kicker="Colour" title="Warm by default, amber is money">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SWATCHES.map((s) => (
            <div key={s.token} className="overflow-hidden rounded-card ring-1 ring-border">
              <div className={`h-20 ${s.className}`} />
              <div className="bg-card p-3">
                <p className="font-heading text-sm font-bold">{s.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{s.hex}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{s.token}</p>
                {s.note && <p className="mt-1 text-[11px] font-semibold text-primary">{s.note}</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-card bg-accent p-5 text-sm leading-relaxed ring-1 ring-border">
          <p className="font-heading text-base font-bold">Contrast notes</p>
          <ul className="mt-2 grid gap-1.5 text-muted-foreground sm:grid-cols-2">
            <li>Ink on cream/card — ~15:1 (AAA). All body text.</li>
            <li>Dark amber on amber — ~8:1 (AAA). The points pill is safe.</li>
            <li>White on teal — ~4.7:1 (AA) for normal text.</li>
            <li>White on coral — ~2.8:1. Large bold labels only, never small text.</li>
            <li>Coral text needing AA at body size → use deeper coral <span className="font-mono">#e4532f</span> (~4.3:1).</li>
            <li>Always keep a visible coral focus ring for keyboard users.</li>
          </ul>
        </div>
      </Section>

      {/* Typography */}
      <Section id="type" kicker="Typography" title="Nunito display, Inter body">
        <div className="space-y-5 rounded-card bg-card p-6 ring-1 ring-border">
          <div>
            <p className="font-heading text-5xl font-extrabold tracking-tight">Your pet&apos;s favourite app</p>
            <p className="mt-1 text-xs text-muted-foreground">Display — Nunito 800, tracked -0.02em</p>
          </div>
          <div>
            <h3 className="text-2xl">A new theme every Monday</h3>
            <p className="mt-1 text-xs text-muted-foreground">Headline — Nunito 800</p>
          </div>
          <div>
            <p className="font-heading text-xl font-bold">Ways to earn Paw Points</p>
            <p className="mt-1 text-xs text-muted-foreground">Title — Nunito 700</p>
          </div>
          <div>
            <p className="max-w-prose text-[15px] leading-relaxed">
              Body copy is Inter, set for comfortable reading at ~65–75 characters per line. It stays
              neutral and legible so the warmth comes from the headings, the colour and Pip — not from
              the paragraph text.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Body — Inter 400, line-height 1.6</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Rewards · Supplies · Weekly</p>
            <p className="mt-1 text-xs text-muted-foreground">Label — Inter 600, uppercase, tracked 0.08em</p>
          </div>
        </div>
      </Section>

      {/* Components */}
      <Section id="components" kicker="Components" title="Pills, cards and warm rings">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 rounded-card bg-card p-6 ring-1 ring-border">
            <Button>Primary</Button>
            <Button variant="points"><PawIcon data-icon="inline-start" /> 30 PP</Button>
            <Button variant="soft">Soft</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-card bg-card p-6 ring-1 ring-border">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-points px-3.5 font-heading text-sm font-extrabold text-points-foreground shadow-[0_4px_12px_-4px_var(--points)]">
              <PawIcon className="size-4" /> <span className="tabular-nums">1,240</span>
            </span>
            <span className="inline-flex h-9 items-center rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground">Selected chip</span>
            <span className="inline-flex h-9 items-center rounded-full bg-card px-3.5 text-sm font-semibold text-foreground/80 ring-1 ring-border">Chip</span>
            <span className="inline-flex items-center rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">In stock</span>
          </div>
          <input
            readOnly
            value="Search food, toys, litter…"
            aria-label="Input sample"
            className="h-12 w-full rounded-full bg-card px-5 text-[15px] text-muted-foreground ring-1 ring-border outline-none"
          />
        </div>
      </Section>

      {/* Motion */}
      <Section id="motion" kicker="Motion" title="Feedback, not decoration">
        <div className="overflow-hidden rounded-card bg-card ring-1 ring-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Duration</th>
                <th className="px-4 py-3 font-semibold">Use</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MOTION.map(([d, use, ex]) => (
                <tr key={d}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold tabular-nums">{d}</td>
                  <td className="px-4 py-3">{use}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Easing is natural deceleration <code className="rounded bg-muted px-1 py-0.5 text-xs">cubic-bezier(0.16, 1, 0.3, 1)</code> for
          arrivals; a gentle <code className="rounded bg-muted px-1 py-0.5 text-xs">pop</code> for counts and badges. Transform and opacity
          only — never width/height/top/left. Every animation has a <code className="rounded bg-muted px-1 py-0.5 text-xs">prefers-reduced-motion</code> path
          that keeps the final state legible. The authored moment is Paw Points landing.
        </p>
      </Section>

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        <p>
          Full guide: <code className="rounded bg-muted px-1.5 py-0.5">docs/BRAND_GUIDE.md</code> · System:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">DESIGN.md</code>
        </p>
        <Button variant="ghost" className="mt-4" nativeButton={false} render={<Link href="/" />}>
          Back to Pawtella
        </Button>
      </footer>
    </main>
  );
}
