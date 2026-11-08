import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";

/** Public auth pages: signed-in users skip straight to the app. */
export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const { user } = await getServerSession();
  if (user) redirect("/home");
  return <>{children}</>;
}
