"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useProducts } from "@/lib/useProducts";
import { useSettings } from "@/lib/useSettings";
import { buildCartLines, lineImage, resolveDeliveryFee, resolveShippingRate } from "@/lib/pricing";
import { fmt } from "@/lib/format";
import { buildOrderWhatsAppUrl } from "@/lib/whatsapp";
import { cartKeyFor } from "@/lib/variants";
import EmptyState from "@/components/EmptyState";
import WhatsAppButton from "@/components/WhatsAppButton";
import { useToast } from "@/context/ToastContext";

export default function CartPage() {
  const { cart, hydrated, changeQty, removeLine, reconcile } = useCart();
  const { products, loading } = useProducts();
  const { settings } = useSettings();
  const { pushToast } = useToast();
  const router = useRouter();
  const [reconciled, setReconciled] = useState(false);

  // Reconcile against fresh stock on mount — the cart persists across days
  // while stock changes server-side. Edge cases 12-13, plans/04 §7.
  useEffect(() => {
    if (!hydrated || loading || reconciled || products.length === 0) return;
    const notes = reconcile(products);
    if (notes.length) pushToast(notes.join(" "));
    // One-shot sync against server stock on mount, not a derived-render loop
    // — `reconciled` guards it from re-firing every render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReconciled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, loading, products, reconciled]);

  if (!hydrated || loading) {
    return <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 20px" }} />;
  }

  const lines = buildCartLines(cart, products);

  if (lines.length === 0) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <EmptyState title="Your bag is empty.">
          <Link
            href="/shop"
            style={{ display: "inline-block", background: "var(--gold-500)", color: "#2e2b25", padding: "12px 26px", borderRadius: 999, fontFamily: "var(--font-caps)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            Browse the collection
          </Link>
        </EmptyState>
      </div>
    );
  }

  const subtotal = lines.reduce((s, l) => s + (l.available ? l.lineTotalRaw : 0), 0);
  const hasUnavailable = lines.some((l) => !l.available);
  const whatsappUrl = buildOrderWhatsAppUrl(lines, fmt(subtotal));

  // No shipping choice has been made yet here — show what the default rate
  // would cost, same resolution the checkout page falls back to. See
  // plans/09 §21.
  const shippingSettings = {
    shippingMultipleRatesEnabled: settings?.shippingMultipleRatesEnabled ?? false,
    shippingRates: settings?.shippingRates ?? [],
  };
  const defaultRate = resolveShippingRate(shippingSettings, null);
  const deliveryNow = resolveDeliveryFee(defaultRate, subtotal, subtotal, {
    shippingFreeAll: settings?.shippingFreeAll ?? false,
    shippingFreeThreshold: settings?.shippingFreeThreshold ?? 0,
  });
  const threshold = settings?.shippingFreeThreshold ?? 0;
  const eligible = defaultRate?.freeShippingEligible ?? false;
  const remainingForFree = threshold > 0 && eligible ? Math.max(0, threshold - subtotal) : 0;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px 60px" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, marginBottom: 24 }}>Your bag</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        {lines.map((line) => {
          const key = line.product ? cartKeyFor(line.product, line.selection) : `${line.productSlug}|${line.variantKey}`;
          return (
            <div key={key} style={{ display: "flex", gap: 14, opacity: line.available ? 1 : 0.5, alignItems: "flex-start" }}>
              <div style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--surface)" }}>
                {line.product && <Image src={lineImage(line, 200)} alt={line.product.name} fill sizes="72px" style={{ objectFit: "cover" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>{line.product?.name ?? "Item"}</div>
                {line.selectionLabel && <div style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--ink-soft)" }}>{line.selectionLabel}</div>}

                {line.available ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: 999 }}>
                      <button aria-label="Decrease quantity" onClick={() => changeQty(key, -1, line.stock)} style={{ width: 32, height: 32, border: "none", background: "none", cursor: "pointer" }}>
                        −
                      </button>
                      <span style={{ minWidth: 22, textAlign: "center", fontSize: 14 }}>{line.qty}</span>
                      <button
                        aria-label="Increase quantity"
                        onClick={() => changeQty(key, 1, line.stock)}
                        disabled={line.qty >= line.stock}
                        style={{ width: 32, height: 32, border: "none", background: "none", cursor: line.qty >= line.stock ? "not-allowed" : "pointer", opacity: line.qty >= line.stock ? 0.4 : 1 }}
                      >
                        +
                      </button>
                    </div>
                    <button onClick={() => removeLine(key)} style={{ background: "none", border: "none", color: "var(--ink-soft)", textDecoration: "underline", fontSize: 13, cursor: "pointer" }}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--clay-500)", margin: "0 0 6px" }}>Sold out — remove to continue</p>
                    <button onClick={() => removeLine(key)} style={{ background: "none", border: "1px solid var(--clay-500)", color: "var(--clay-500)", borderRadius: 999, padding: "5px 14px", fontSize: 12, cursor: "pointer" }}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--ink)", whiteSpace: "nowrap" }}>
                {line.available ? fmt(line.lineTotalRaw) : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-display)", fontSize: 18 }}>
          <span>Subtotal</span>
          <span>{fmt(subtotal)}</span>
        </div>
        {subtotal > 0 && defaultRate && (
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink-soft)", marginTop: 4 }}>
            <span>Delivery ({defaultRate.label})</span>
            <span>{deliveryNow === 0 ? "Free" : fmt(deliveryNow)}</span>
          </div>
        )}
        {remainingForFree > 0 && subtotal > 0 && (
          <p style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
            {fmt(remainingForFree)} more for free delivery
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          onClick={() => router.push("/checkout")}
          disabled={hasUnavailable}
          title={hasUnavailable ? "Remove sold-out items before checking out." : undefined}
          style={{
            width: "100%",
            minHeight: 50,
            border: "none",
            borderRadius: 999,
            background: hasUnavailable ? "var(--line)" : "var(--gold-500)",
            color: hasUnavailable ? "var(--ink-soft)" : "#2e2b25",
            fontFamily: "var(--font-caps)",
            fontSize: 13,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: hasUnavailable ? "not-allowed" : "pointer",
          }}
        >
          Checkout
        </button>
        <WhatsAppButton href={whatsappUrl} />
        {hasUnavailable && (
          <p style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--clay-500)", textAlign: "center" }}>
            Remove sold-out items before checking out.
          </p>
        )}
      </div>
    </div>
  );
}
