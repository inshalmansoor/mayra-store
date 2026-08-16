import { Suspense } from "react";
import { getCategories, getProducts } from "@/lib/products";
import ShopClient from "./ShopClient";

export const metadata = { title: "Shop" };

export default async function ShopPage() {
  const [products, categories] = await Promise.all([
    getProducts().catch(() => []),
    getCategories().catch(() => []),
  ]);

  return (
    <Suspense fallback={null}>
      <ShopClient products={products} categories={categories} />
    </Suspense>
  );
}
