import Link from "next/link";
import { cn } from "@/lib/utils";

/** Site footer with the legal links required on every page. */
export function Footer({ className }: { className?: string }) {
  const year = 2026;
  return (
    <footer className={cn("border-t border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground", className)}>
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
        <p>© {year} Bone & Biscuit College West (operating as Pawtella) · Toronto, Canada</p>
        <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/terms" className="hover:text-primary hover:underline">
            Terms of Use
          </Link>
          <Link href="/privacy" className="hover:text-primary hover:underline">
            Privacy Policy
          </Link>
          <Link href="/shipping" className="hover:text-primary hover:underline">
            Shipping
          </Link>
          <Link href="/returns" className="hover:text-primary hover:underline">
            Returns &amp; Refunds
          </Link>
        </nav>
      </div>
    </footer>
  );
}
