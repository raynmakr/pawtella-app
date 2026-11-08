import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo, PawIcon } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size="md" className="mb-10" />
      <div className="mb-6 flex size-24 items-center justify-center rounded-[2rem] bg-coral-soft text-primary">
        <PawIcon className="size-12 rotate-12" />
      </div>
      <h1 className="text-3xl">This page wandered off</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">We looked under the couch and behind the food bowl. Nothing here.</p>
      <Button size="lg" className="mt-8" render={<Link href="/" />}>
        Take me home
      </Button>
    </main>
  );
}
