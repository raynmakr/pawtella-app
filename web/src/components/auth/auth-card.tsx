import Link from "next/link";
import { Logo } from "@/components/logo";

interface AuthCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Centered card layout shared by login / register / forgot / reset. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center sm:py-12">
      <Link href="/welcome" aria-label="Pawtella" className="mb-8">
        <Logo size="md" />
      </Link>
      <div className="w-full max-w-md rounded-card bg-card p-6 shadow-soft ring-1 ring-border sm:p-8">
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-[15px] text-muted-foreground">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
    </main>
  );
}
