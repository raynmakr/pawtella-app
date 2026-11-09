import type { Metadata } from "next";
import { Suspense } from "react";
import { CartScreen } from "@/components/shop/cart-screen";
import { ListSkeleton } from "@/components/list-skeleton";

export const metadata: Metadata = { title: "Cart" };

export default function CartPage() {
  return (
    <Suspense fallback={<ListSkeleton variant="card" rows={2} />}>
      <CartScreen />
    </Suspense>
  );
}
