import type { Metadata } from "next";
import { OrderDetailScreen } from "@/components/shop/order-detail-screen";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${id}` };
}

export default async function OrderPage({ params }: Props) {
  const { id } = await params;
  return <OrderDetailScreen id={id} />;
}
