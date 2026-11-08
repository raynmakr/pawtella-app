import type { Metadata } from "next";
import { PointsHistory } from "@/components/points/points-history";

export const metadata: Metadata = { title: "Points history" };

export default function PointsHistoryPage() {
  return <PointsHistory />;
}
