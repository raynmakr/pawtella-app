import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";

export default async function RootPage() {
  const { user } = await getServerSession();
  redirect(user ? "/home" : "/welcome");
}
