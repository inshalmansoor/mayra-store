"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { coverImage, firstAvailable, isSoldOut, isSingleCombination, productStock } from "@/lib/variants";
import { fmt } from "@/lib/format";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { useRouter } from "next/navigation";

export default function ProductCard({ product, onOpenSheet }: { product: Product; onOpenSheet: (p: Product) => void }) {
  const { isWished, toggleWish } = useWishlist();
  const { addToCart } = useCart();
  const { pushToast } = useToast();
  const router = useRouter();
  const wished = isWished(product.id);
  const soldOut = isSoldOut(product);
  const [imgLoaded, setImgLoaded] = useState(false);

  const hasDelta = product.options.some((o) => o.values.some((v) => v.priceDelta));
  const priceLabel = (hasDelta ? "From " : "") + fmt(product.basePrice);
  const stock = productStock(product);
  const lowStock = !soldOut && stock > 0 && stock <= 3;

  function handleAdd() {
    if (soldOut) {
      router.push(`/product/${product.id}`);
      return;
    }
    if (isSingleCombination(product)) {
      const sel = firstAvailable(product) || {};
      addToCart(product, sel, 1);
      pushToast(`Added · ${product.name}`, "View bag", () => router.push("/cart"));
    } else {
      onOpenSheet(product);
    }
  }

  return (
    <div className="mrow" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative" }}>
        <Link
          href={`/product/${product.id}`}
          style={{
            position: "relative",
            display: "block",
            aspectRatio: "3 / 4",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--surface)",
          }}
        >
          <Image
            src={coverImage(product, "default", 500)}
            alt={`${product.name} — ${product.material}`}
            fill
            sizes="(max-width: 480px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="mimg"
            style={{ objectFit: "cover", opacity: imgLoaded ? 1 : 0, transition: "opacity 0.3s" }}
            onLoad={() => setImgLoaded(true)}
          />
        </Link>
        {(soldOut || product.collection === "golden-essence") && (
          <span
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: soldOut ? "rgba(46,43,37,0.8)" : "var(--gold-500)",
              color: soldOut ? "#fff" : "#2e2b25",
              fontFamily: "var(--font-caps)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "4px 9px",
              borderRadius: 999,
            }}
          >
            {soldOut ? "Sold out" : "Golden Essence"}
          </span>
        )}
        <button
          aria-label={wished ? "Remove from wishlist" : "Save to wishlist"}
          aria-pressed={wished}
          onClick={() => toggleWish(product.id)}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 36,
            height: 36,
            minWidth: 44,
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            border: "none",
            background: "rgba(253,248,239,0.85)",
            cursor: "pointer",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={wished ? "#97741f" : "none"} stroke="#97741f" strokeWidth={2}>
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
        </button>
      </div>

      <Link href={`/product/${product.id}`} style={{ marginTop: 10, color: "var(--ink)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1.3 }}>{product.name}</div>
      </Link>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--gold-700)" }}>{priceLabel}</span>
        {lowStock && (
          <span style={{ fontFamily: "var(--font-caps)", fontSize: 11, color: "var(--clay-500)" }}>Only {stock} left</span>
        )}
      </div>

      <button
        onClick={handleAdd}
        style={{
          marginTop: 8,
          width: "100%",
          minHeight: 40,
          border: soldOut ? "1px solid var(--line)" : "none",
          background: soldOut ? "transparent" : "var(--gold-100)",
          color: soldOut ? "var(--ink-soft)" : "var(--gold-700)",
          borderRadius: 999,
          fontFamily: "var(--font-caps)",
          fontSize: 12,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        {soldOut ? "View" : "Add to bag"}
      </button>
    </div>
  );
}
