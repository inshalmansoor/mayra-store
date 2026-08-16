"use client";

import Link from "next/link";
import { useWishlist } from "@/context/WishlistContext";
import { useProducts } from "@/lib/useProducts";
import CatalogueGrid from "@/components/CatalogueGrid";
import EmptyState from "@/components/EmptyState";

export default function WishlistPage() {
  const { wishlist, hydrated } = useWishlist();
  const { products, loading } = useProducts();

  if (!hydrated || loading) return <div style={{ padding: 60 }} />;

  const items = products.filter((p) => wishlist.includes(p.id));

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 60px" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, marginBottom: 24 }}>Saved pieces</h1>

      {items.length === 0 ? (
        <EmptyState title="Nothing saved yet." subtitle="Tap the heart on a piece to keep it here.">
          <Link
            href="/shop"
            style={{ display: "inline-block", background: "var(--gold-500)", color: "#2e2b25", padding: "12px 26px", borderRadius: 999, fontFamily: "var(--font-caps)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            Browse the collection
          </Link>
        </EmptyState>
      ) : (
        <CatalogueGrid products={items} />
      )}
    </div>
  );
}
