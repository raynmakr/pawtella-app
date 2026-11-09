import type { Metadata } from "next";
import { PointsScreen } from "@/components/points/points-screen";

export const metadata: Metadata = { title: "Paw Points" };

export default function PointsPage() {
  return <PointsScreen />;
}
