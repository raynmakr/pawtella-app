import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { Footer } from "@/components/footer";

/** Public auth pages: signed-in users skip straight to the app. */
export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const { user } = await getServerSession();
  if (user) redirect("/home");
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">{children}</div>
      <Footer className="bg-transparent" />
    </div>
  );
}
