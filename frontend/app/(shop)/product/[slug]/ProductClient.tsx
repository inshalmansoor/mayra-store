"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product, Selection } from "@/lib/types";
import {
  firstAvailable,
  galleryImages,
  getVariant,
  isAvailable,
  isSoldOut,
  optionValue,
  selectionLabel,
  variantPrice,
} from "@/lib/variants";
import { fmt } from "@/lib/format";
import { buildOrderWhatsAppUrl } from "@/lib/whatsapp";
import { useSettings } from "@/lib/useSettings";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useToast } from "@/context/ToastContext";
import Gallery from "@/components/Gallery";
import SwatchPicker from "@/components/SwatchPicker";
import SegmentPicker from "@/components/SegmentPicker";
import QtyStepper from "@/components/QtyStepper";
import StockLine from "@/components/StockLine";
import Accordion from "@/components/Accordion";
import SizeGuideModal from "@/components/SizeGuideModal";
import WhatsAppButton from "@/components/WhatsAppButton";
import CatalogueGrid from "@/components/CatalogueGrid";
import { notifyMe } from "@/lib/products";

export default function ProductClient({ product, related, lowStockAt }: { product: Product; related: Product[]; lowStockAt: number }) {
  const { addToCart, qtyInCart } = useCart();
  const { isWished, toggleWish } = useWishlist();
  const { pushToast } = useToast();
  const router = useRouter();
  const { settings } = useSettings();
  const whatsappNumber = settings?.whatsappNumber ?? "";

  const initial = firstAvailable(product); // null if the whole product is sold out — edge case 3/4
  const [selection, setSelection] = useState<Selection>(initial || {});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifySent, setNotifySent] = useState(false);

  const wished = isWished(product.id);
  const wholeProductSoldOut = isSoldOut(product);
  const variant = getVariant(product, selection);
  const available = isAvailable(product, selection);
  const stock = variant?.stock ?? 0;
  const inCart = qtyInCart(product, selection);
  const cap = Math.max(0, stock - inCart);
  const price = variantPrice(product, selection);
  const selLabel = selectionLabel(product, selection);
  const images = useMemo(() => galleryImages(product, selection.colour, 1000), [product, selection.colour]);

  function handleSelect(optKey: string, valueId: string) {
    let next: Selection = { ...selection, [optKey]: valueId };
    let newNote: string | null = null;

    if (!isAvailable(product, next)) {
      const otherOpts = product.options.filter((o) => o.key !== optKey);
      outer: for (const oo of otherOpts) {
        for (const val of oo.values) {
          const testSel = { ...next, [oo.key]: val.id };
          if (isAvailable(product, testSel)) {
            const chosenOpt = product.options.find((o) => o.key === optKey)!;
            const chosenLabel = optionValue(chosenOpt, valueId)?.label ?? valueId;
            const oldVal = optionValue(oo, selection[oo.key]);
            const oldLabel = oldVal ? oldVal.label : val.label;
            newNote = `${oldLabel} isn't available in ${chosenLabel} — switched to ${val.label}.`;
            next = testSel;
            break outer;
          }
        }
      }
    }
    setSelection(next);
    setNote(newNote);
    setQty(1);
    setGalleryIndex(0);
  }

  function handleAdd() {
    if (!available || cap <= 0) return;
    addToCart(product, selection, qty);
    pushToast(`Added · ${product.name}${selLabel ? ", " + selLabel : ""}`, "View bag", () => router.push("/cart"));
  }

  async function handleNotify() {
    if (!notifyEmail.trim()) return;
    try {
      await notifyMe({ productSlug: product.id, email: notifyEmail.trim() });
    } catch {
      // best-effort — still confirm, matches the prototype's behaviour
    }
    pushToast("Thanks — we'll email you when it's back.");
    setNotifySent(true);
    setNotifyEmail("");
  }

  const whatsappUrl = buildOrderWhatsAppUrl(
    [
      {
        productSlug: product.id,
        variantKey: "",
        selection,
        qty,
        product,
        available,
        unitPrice: price,
        lineTotalRaw: price * qty,
        lineTotalLabel: fmt(price * qty),
        selectionLabel: selLabel,
        stock,
      },
    ],
    fmt(price * qty),
    whatsappNumber,
  );

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 80px" }}>
      <div className="pdp-layout" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 32 }}>
        <div>
          <Gallery images={images} alt={`${product.name} — ${product.material}`} activeIndex={galleryIndex} onIndexChange={setGalleryIndex} />
        </div>

        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: "0 0 6px" }}>{product.name}</h1>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--gold-700)", marginBottom: 8 }}>{fmt(price)}</div>
          <div style={{ marginBottom: 18 }}>
            <StockLine stock={stock} soldOut={wholeProductSoldOut || !available} lowStockAt={lowStockAt} />
          </div>

          {wholeProductSoldOut ? (
            <div style={{ padding: 16, background: "var(--surface)", borderRadius: 10, marginBottom: 20 }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 15, margin: "0 0 12px" }}>
                This piece is sold out right now.
              </p>
              {notifySent ? (
                <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--forest-500)" }}>
                  We&rsquo;ll email you when it&rsquo;s back.
                </p>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email for restock notification"
                    style={{ flex: 1, minWidth: 180, padding: "10px 14px", borderRadius: 999, border: "1px solid rgba(46,43,37,0.2)" }}
                  />
                  <button
                    onClick={handleNotify}
                    style={{ background: "var(--forest-500)", color: "#fff", border: "none", borderRadius: 999, padding: "10px 18px", fontFamily: "var(--font-caps)", fontSize: 12, letterSpacing: "0.05em", cursor: "pointer" }}
                  >
                    Notify me
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {note && <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--clay-500)", marginBottom: 12 }}>{note}</p>}

              <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 18 }}>
                {product.options.map((opt) =>
                  opt.type === "swatch" ? (
                    <SwatchPicker key={opt.key} product={product} option={opt} selection={selection} onSelect={(v) => handleSelect(opt.key, v)} />
                  ) : (
                    <SegmentPicker key={opt.key} product={product} option={opt} selection={selection} onSelect={(v) => handleSelect(opt.key, v)} />
                  ),
                )}
                {product.category === "necklaces" && product.options.some((o) => o.key === "length") && (
                  <button
                    onClick={() => setSizeGuideOpen(true)}
                    style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--gold-700)", textDecoration: "underline", fontFamily: "var(--font-body)", fontSize: 14, cursor: "pointer", padding: 0 }}
                  >
                    Size guide
                  </button>
                )}
              </div>

              {selLabel && (
                <p style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--ink-soft)", marginBottom: 16 }}>
                  {fmt(price)} · {selLabel}
                </p>
              )}

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "var(--font-caps)", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 8 }}>
                  Quantity
                </div>
                <QtyStepper qty={qty} onChange={setQty} cap={cap} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
                <button
                  onClick={handleAdd}
                  disabled={!available || cap <= 0}
                  style={{
                    width: "100%",
                    minHeight: 50,
                    border: "none",
                    borderRadius: 999,
                    background: available && cap > 0 ? "var(--gold-500)" : "var(--line)",
                    color: available && cap > 0 ? "#2e2b25" : "var(--ink-soft)",
                    fontFamily: "var(--font-caps)",
                    fontSize: 13,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: available && cap > 0 ? "pointer" : "not-allowed",
                  }}
                >
                  Add to bag
                </button>
                {whatsappNumber && <WhatsAppButton href={whatsappUrl} />}
              </div>
            </>
          )}

          <button
            onClick={() => toggleWish(product.id)}
            aria-pressed={wished}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "var(--ink)", fontFamily: "var(--font-body)", fontSize: 14, cursor: "pointer", padding: "10px 0", minHeight: 44 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={wished ? "#97741f" : "none"} stroke="#97741f" strokeWidth={2}>
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
            </svg>
            {wished ? "Saved" : "Save for later"}
          </button>

          <div style={{ marginTop: 8 }}>
            <Accordion title="Care" defaultOpen>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {product.care.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </Accordion>
            <Accordion title="Material">
              <p style={{ margin: 0 }}>{product.material}. Doesn&rsquo;t tarnish like brass, safe for most skin.</p>
            </Accordion>
            <Accordion title="Delivery">
              <p style={{ margin: 0 }}>Delivered across Pakistan in 3–5 working days. Free over Rs 5,000.</p>
            </Accordion>
            <Accordion title="Returns">
              <p style={{ margin: 0 }}>Unworn pieces in original packaging can be exchanged within 3 days of delivery — message us on WhatsApp to arrange it.</p>
            </Accordion>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section style={{ marginTop: 60 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 18 }}>You may also like</h2>
          <CatalogueGrid products={related} />
        </section>
      )}

      <SizeGuideModal open={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} />

      <style>{`
        @media (min-width: 768px) {
          .pdp-layout { grid-template-columns: 1fr 1fr !important; align-items: start; }
          .pdp-layout > div:first-child { position: sticky; top: 84px; }
        }
      `}</style>
    </div>
  );
}
