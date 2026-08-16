import { redirect } from "next/navigation";
import { getProduct, getProducts, getSettings } from "@/lib/products";
import ProductClient from "./ProductClient";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product" };
  return {
    title: product.name,
    description: product.blurb,
    openGraph: { title: product.name, description: product.blurb },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [product, allProducts, settings] = await Promise.all([
    getProduct(slug),
    getProducts().catch(() => []),
    getSettings().catch(() => null),
  ]);

  // Edge case 19: unknown product id falls back to /shop with a notice
  // rather than crashing on a null lookup — plans/04 §7.
  if (!product) {
    redirect("/shop?notice=missing");
  }

  const related = allProducts.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);

  return <ProductClient product={product} related={related} lowStockAt={settings?.lowStockAt ?? 3} />;
}
