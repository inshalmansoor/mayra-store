"use client";

import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";
import { firstAvailable, isSoldOut } from "@/lib/variants";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import CatalogueGrid from "@/components/CatalogueGrid";

export default function GoldenEssenceClient({ products }: { products: Product[] }) {
  const { addToCart } = useCart();
  const { pushToast } = useToast();
  const router = useRouter();

  function shopFullStack() {
    const inStock = products.filter((p) => !isSoldOut(p));
    inStock.forEach((p) => {
      const sel = firstAvailable(p);
      if (sel) addToCart(p, sel, 1);
    });
    pushToast("Added the full stack to your bag", "View bag", () => router.push("/cart"));
  }

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <button
          onClick={shopFullStack}
          style={{ background: "var(--forest-500)", color: "#fff", border: "none", borderRadius: 999, padding: "13px 28px", fontFamily: "var(--font-caps)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}
        >
          Shop the full stack
        </button>
      </div>
      <CatalogueGrid products={products} />
    </>
  );
}
