import type { Metadata } from "next";
import { PublicProfile } from "@/components/profile/public-profile";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${decodeURIComponent(handle)}` };
}

export default async function UserPage({ params }: Props) {
  const { handle } = await params;
  return <PublicProfile handle={decodeURIComponent(handle).replace(/^@/, "").toLowerCase()} />;
}
