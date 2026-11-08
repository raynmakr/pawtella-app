import type { Metadata } from "next";
import { ChatScreen } from "@/components/ask/chat-screen";

export const metadata: Metadata = { title: "Ask" };

// The (app) layout reads cookies, so this route is always dynamic: no Suspense boundary is needed
// for useSearchParams, and skipping it keeps the session-aware UI hydrating in one pass.
export default function AskPage() {
  return <ChatScreen />;
}
