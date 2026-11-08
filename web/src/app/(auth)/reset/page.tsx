import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: PageProps<"/reset">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <AuthCard
      title="Choose a new password"
      description={token ? "Make it at least 8 characters." : "This reset link is missing its token."}
      footer={
        <Link href="/forgot" className="font-semibold text-primary hover:underline">
          Request a new link
        </Link>
      }
    >
      <ResetForm token={token} />
    </AuthCard>
  );
}
