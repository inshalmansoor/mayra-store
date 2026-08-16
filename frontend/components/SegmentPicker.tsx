"use client";

import type { Product, ProductOption, Selection } from "@/lib/types";
import { valueState } from "@/lib/variants";

export default function SegmentPicker({
  product,
  option,
  selection,
  onSelect,
}: {
  product: Product;
  option: ProductOption;
  selection: Selection;
  onSelect: (valueId: string) => void;
}) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-caps)", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 8 }}>
        {option.label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {option.values.map((v) => {
          const state = valueState(product, selection, option.key, v.id);
          const selected = selection[option.key] === v.id;
          const disabled = state !== "available";
          const hatched = state === "nonexistent";
          const struck = state === "soldout";

          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={selected}
              aria-disabled={disabled}
              title={disabled ? (hatched ? "Not made in this combination." : "Sold out.") : v.label}
              disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              onClick={() => !disabled && onSelect(v.id)}
              style={{
                padding: "10px 16px",
                minHeight: 44,
                borderRadius: 999,
                border: selected ? "2px solid var(--gold-700)" : "1px solid rgba(46,43,37,0.25)",
                background: selected ? "var(--gold-100)" : "#fff",
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
                fontFamily: "var(--font-caps)",
                fontSize: 13,
                letterSpacing: "0.03em",
                textDecoration: struck ? "line-through" : "none",
                color: "var(--ink)",
                backgroundImage: hatched
                  ? "repeating-linear-gradient(45deg, rgba(46,43,37,0.12) 0 3px, transparent 3px 8px)"
                  : undefined,
              }}
            >
              {v.label}
              {typeof v.priceDelta === "number" && v.priceDelta > 0 ? ` (+Rs ${v.priceDelta})` : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
