import { redirect } from "next/navigation";
import { getServerSession, hasOnboardedCookie } from "@/lib/session";
import { SessionHydrator } from "@/components/session-provider";
import { AppShell } from "@/components/app-shell";

/**
 * Auth gate for the signed-in app. No session → /welcome. A signed-in user with no pets is
 * sent to onboarding once (until the `pawtella_onboarded` cookie is set by its Continue button).
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getServerSession();
  if (!session.user) redirect("/welcome");
  if (session.pets.length === 0 && !(await hasOnboardedCookie())) redirect("/onboarding/add-pet");
  return (
    <>
      <SessionHydrator initial={session} />
      <AppShell>{children}</AppShell>
    </>
  );
}
