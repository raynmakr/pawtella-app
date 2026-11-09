import type { Metadata } from "next";
import { SubscriptionsScreen } from "@/components/subscriptions/subscriptions-screen";

export const metadata: Metadata = { title: "My subscriptions" };

export default function SubscriptionsPage() {
  return <SubscriptionsScreen />;
}
