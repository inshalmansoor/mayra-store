"use client";

// Bottom sheet (mobile) / centred modal (desktop) opened from the listing's
// "Add to bag" button. See plans/04-frontend-nextjs.md §8.
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Product, Selection } from "@/lib/types";
import {
  coverImage,
  firstAvailable,
  getVariant,
  isAvailable,
  optionValue,
  variantPrice,
} from "@/lib/variants";
import { fmt } from "@/lib/format";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import SwatchPicker from "./SwatchPicker";
import SegmentPicker from "./SegmentPicker";
import QtyStepper from "./QtyStepper";

export default function VariantSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { addToCart, qtyInCart } = useCart();
  const { pushToast } = useToast();
  const router = useRouter();
  const [selection, setSelection] = useState<Selection>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Resets the sheet's local state when a different product opens it —
    // `product` is an externally-controlled prop (which card was clicked),
    // not something derivable purely from the previous render.
    if (!product) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelection(firstAvailable(product) || {});
    setQty(1);
    setNote(null);
    setTimeout(() => closeBtnRef.current?.focus(), 30);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [product, onClose]);

  const allChosen = useMemo(
    () => !!product && product.options.every((o) => selection[o.key] !== undefined),
    [product, selection],
  );
  const available = product ? isAvailable(product, selection) : false;
  const variant = product ? getVariant(product, selection) : undefined;
  const stock = variant?.stock ?? 0;
  const inCart = product ? qtyInCart(product, selection) : 0;
  const cap = Math.max(0, stock - inCart);

  function handleSelect(optKey: string, valueId: string) {
    if (!product) return;
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
  }

  function confirm() {
    if (!product || !available) return;
    addToCart(product, selection, qty);
    onClose();
    const label = product.options
      .map((o) => optionValue(o, selection[o.key])?.label)
      .filter(Boolean)
      .join(", ");
    pushToast(`Added · ${product.name}${label ? ", " + label : ""}`, "View bag", () => router.push("/cart"));
  }

  if (!product) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Add ${product.name}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 75,
        background: "rgba(46,43,37,0.5)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      className="sheet-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="sheet-panel"
        style={{
          background: "var(--surface)",
          borderRadius: "16px 16px 0 0",
          width: "100%",
          maxWidth: 480,
          maxHeight: "88vh",
          overflowY: "auto",
          padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ position: "relative", width: 56, height: 56, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
              <Image src={coverImage(product, selection.colour, 200)} alt={product.name} fill sizes="56px" style={{ objectFit: "cover" }} />
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{product.name}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--gold-700)" }}>
                {fmt(variantPrice(product, selection))}
              </div>
            </div>
          </div>
          <button ref={closeBtnRef} aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", minWidth: 44, minHeight: 44 }}>
            ✕
          </button>
        </div>

        {note && (
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--clay-500)", marginBottom: 12 }}>{note}</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18 }}>
          {product.options.map((opt) =>
            opt.type === "swatch" ? (
              <SwatchPicker key={opt.key} product={product} option={opt} selection={selection} onSelect={(v) => handleSelect(opt.key, v)} />
            ) : (
              <SegmentPicker key={opt.key} product={product} option={opt} selection={selection} onSelect={(v) => handleSelect(opt.key, v)} />
            ),
          )}
        </div>

        {available && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "var(--font-caps)", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 8 }}>
              Quantity
            </div>
            <QtyStepper qty={qty} onChange={setQty} cap={cap} />
          </div>
        )}

        <button
          onClick={confirm}
          disabled={!allChosen || !available || cap <= 0}
          style={{
            width: "100%",
            minHeight: 50,
            border: "none",
            borderRadius: 999,
            background: allChosen && available && cap > 0 ? "var(--gold-500)" : "var(--line)",
            color: allChosen && available && cap > 0 ? "#2e2b25" : "var(--ink-soft)",
            fontFamily: "var(--font-caps)",
            fontSize: 13,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: allChosen && available && cap > 0 ? "pointer" : "not-allowed",
          }}
        >
          {!allChosen ? "Choose options" : !available ? "Sold out" : "Add to bag"}
        </button>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .sheet-backdrop { align-items: center !important; }
          .sheet-panel { border-radius: 16px !important; max-height: 80vh !important; }
        }
      `}</style>
    </div>
  );
}
