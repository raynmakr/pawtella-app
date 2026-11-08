import type { Metadata } from "next";
import { InviteScreen } from "@/components/invite/invite-screen";

export const metadata: Metadata = { title: "Invite friends" };

export default function InvitePage() {
  return <InviteScreen />;
}
