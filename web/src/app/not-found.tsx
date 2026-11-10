import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Mascot } from "@/components/mascot";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size="md" className="mb-8" />
      <Mascot pose="sad" float className="mb-4 w-36" title="Pip looking lost" />
      <h1 className="text-3xl">This page wandered off</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">We looked under the couch and behind the food bowl. Nothing here.</p>
      <Button size="lg" className="mt-8" nativeButton={false} render={<Link href="/" />}>
        Take me home
      </Button>
    </main>
  );
}
