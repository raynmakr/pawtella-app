import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { HeartPulseIcon, ShoppingBagIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo, PawIcon } from "@/components/logo";
import { GoogleButton } from "@/components/auth/google-button";
import { ReferralCapture } from "@/components/auth/referral-capture";

export const metadata: Metadata = { title: "Welcome" };

const VALUE_PROPS = [
  { icon: SparklesIcon, title: "Create AI videos of your pet", body: "Turn a photo into a playful clip and share it with the pack.", tone: "bg-coral-soft text-primary" },
  { icon: HeartPulseIcon, title: "Ask anything about their health and habits", body: "A friendly assistant that knows your pet and when to call the vet.", tone: "bg-teal-soft text-secondary" },
  { icon: ShoppingBagIcon, title: "Shop supplies with pickup in Toronto or delivery", body: "Food, toys and treats. Earn Paw Points on every order.", tone: "bg-accent text-points-foreground dark:text-points" },
];

export default function WelcomePage() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <Suspense fallback={null}>
        <ReferralCapture />
      </Suspense>
      {/* warm backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -right-24 size-[420px] rounded-full bg-coral-soft/80 blur-3xl dark:bg-coral-soft/40" />
        <div className="absolute top-1/3 -left-32 size-[380px] rounded-full bg-teal-soft/80 blur-3xl dark:bg-teal-soft/40" />
        <div className="absolute -bottom-40 right-1/4 size-[360px] rounded-full bg-accent blur-3xl dark:bg-accent/40" />
      </div>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:gap-16 lg:py-16">
        {/* Hero */}
        <section className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          <Logo size="lg" className="mb-10 lg:mb-14" />
          <div className="relative mb-6 flex size-28 items-center justify-center rounded-[2.25rem] bg-primary text-primary-foreground shadow-lift lg:hidden">
            <PawIcon className="size-14 -rotate-12" />
          </div>
          <h1 className="max-w-xl text-balance text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
            Your pet&apos;s <span className="text-primary">favourite</span> app
          </h1>
          <p className="mt-4 max-w-md text-balance text-base text-muted-foreground sm:text-lg">
            For cat and dog people. Make something adorable, get real answers, and keep the bowls full.
          </p>

          <ul className="mt-10 grid w-full max-w-xl gap-3 text-left">
            {VALUE_PROPS.map((v) => (
              <li key={v.title} className="flex items-start gap-4 rounded-card bg-card/80 p-4 ring-1 ring-border backdrop-blur-sm">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${v.tone}`}>
                  <v.icon className="size-5" />
                </span>
                <span>
                  <span className="block font-heading text-[15px] font-bold leading-snug">{v.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{v.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Actions */}
        <section className="mt-10 w-full lg:mt-0 lg:max-w-sm">
          <div className="rounded-card bg-card p-6 shadow-soft ring-1 ring-border sm:p-8">
            <h2 className="text-xl">Join the pack</h2>
            <p className="mt-1 text-sm text-muted-foreground">Free, and you start with 30 Paw Points.</p>
            <div className="mt-6 flex flex-col gap-3">
              <GoogleButton />
              <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <Button size="lg" className="w-full" render={<Link href="/login" />}>
                Continue with email
              </Button>
            </div>
            <p className="mt-5 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link href="/register" className="font-semibold text-primary hover:underline">
                Create an account
              </Link>
            </p>
          </div>
          <p className="mt-5 px-4 text-center text-xs leading-relaxed text-muted-foreground">
            By continuing you agree to our Terms and acknowledge our Privacy Policy. Toronto-made, pet-approved.
          </p>
        </section>
      </div>
    </main>
  );
}
