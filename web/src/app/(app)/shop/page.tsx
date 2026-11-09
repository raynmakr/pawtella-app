import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopScreen } from "@/components/shop/shop-screen";
import { ListSkeleton } from "@/components/list-skeleton";

export const metadata: Metadata = {
  title: "Shop",
  description: "Pet food, toys and treats. Pickup at our Toronto depot, local delivery, or shipping across Canada and the US. Earn Paw Points on every order.",
};

export default function ShopPage() {
  return (
    <Suspense fallback={<ListSkeleton variant="tile" rows={8} className="lg:grid-cols-4" />}>
      <ShopScreen />
    </Suspense>
  );
}
