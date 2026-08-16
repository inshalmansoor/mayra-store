"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";
import ProductGrid from "./ProductGrid";
import VariantSheet from "./VariantSheet";

export default function CatalogueGrid({
  products,
  emptyTitle,
  emptyAction,
}: {
  products: Product[];
  emptyTitle?: string;
  emptyAction?: React.ReactNode;
}) {
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);
  return (
    <>
      <ProductGrid products={products} onOpenSheet={setSheetProduct} emptyTitle={emptyTitle} emptyAction={emptyAction} />
      <VariantSheet product={sheetProduct} onClose={() => setSheetProduct(null)} />
    </>
  );
}
