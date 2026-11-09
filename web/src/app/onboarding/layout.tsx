import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { SessionHydrator } from "@/components/session-provider";

export default async function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  const session = await getServerSession();
  if (!session.user) redirect("/welcome");
  return (
    <>
      <SessionHydrator initial={session} />
      {children}
    </>
  );
}
