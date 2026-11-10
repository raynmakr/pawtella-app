import Link from "next/link";
import { Logo } from "@/components/logo";
import { Footer } from "@/components/footer";

/** Public reading layout for /terms and /privacy — no auth, clean header, legal footer. */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="border-b border-border bg-card/60 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" aria-label="Pawtella home" className="inline-flex">
            <Logo />
          </Link>
          <Link href="/home" className="text-sm font-medium text-primary hover:underline">
            Open app
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
