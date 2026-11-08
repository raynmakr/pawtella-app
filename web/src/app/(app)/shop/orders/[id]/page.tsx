import { redirect } from "next/navigation";

/** Legacy link shape used by notifications (`/shop/orders/:id`) → canonical /orders/:id. */
export default async function LegacyOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/orders/${id}`);
}
