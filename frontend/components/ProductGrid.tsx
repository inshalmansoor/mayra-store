"use client";

import type { Product } from "@/lib/types";
import ProductCard from "./ProductCard";
import EmptyState from "./EmptyState";

export default function ProductGrid({
  products,
  onOpenSheet,
  emptyTitle,
  emptyAction,
}: {
  products: Product[];
  onOpenSheet: (p: Product) => void;
  emptyTitle?: string;
  emptyAction?: React.ReactNode;
}) {
  if (products.length === 0) {
    return <EmptyState title={emptyTitle || "Nothing here yet."}>{emptyAction}</EmptyState>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "20px 16px",
      }}
      className="product-grid"
    >
      {products.map((p) => (
        <ProductCard key={p.id} product={p} onOpenSheet={onOpenSheet} />
      ))}
      <style>{`
        @media (min-width: 768px) {
          .product-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 28px 22px !important; }
        }
        @media (min-width: 1024px) {
          .product-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
