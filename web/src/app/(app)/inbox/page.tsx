import type { Metadata } from "next";
import { InboxList } from "@/components/inbox/inbox-list";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return <InboxList />;
}
