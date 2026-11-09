import type { Metadata } from "next";
import { serverApi } from "@/lib/server-api";
import { ProductScreen } from "@/components/shop/product-screen";
import type { ProductDetail } from "@/types/shop";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  try {
    const { product } = await serverApi<{ product: ProductDetail }>(`/api/shop/products/${encodeURIComponent(handle)}`);
    const price = new Intl.NumberFormat("en-CA", { style: "currency", currency: product.currency || "CAD" }).format(product.priceCents / 100);
    const description = `${product.description || product.title} · ${price} · ${product.vendor}`.slice(0, 200);
    const image = product.images[0]?.url;
    return {
      title: product.title,
      description,
      openGraph: { title: `${product.title} · Pawtella`, description, images: image ? [{ url: image, alt: product.images[0]?.alt ?? product.title }] : undefined, type: "website" },
      twitter: { card: "summary_large_image", title: product.title, description, images: image ? [image] : undefined },
    };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductPage({ params }: Props) {
  const { handle } = await params;
  return <ProductScreen handle={handle} />;
}
