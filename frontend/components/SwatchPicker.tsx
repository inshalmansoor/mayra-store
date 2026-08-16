"use client";

// Colour circles with all three disabled states from plans/04 §7 rows 1,2,6.
// available: selectable. soldout: struck through, aria-disabled. nonexistent:
// hatched, different tooltip — never presented as "sold out" when it just
// was never made.
import type { Product, ProductOption, Selection } from "@/lib/types";
import { valueState, optionValueHasAnyStock } from "@/lib/variants";

export default function SwatchPicker({
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
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {option.values.map((v) => {
          const state = valueState(product, selection, option.key, v.id);
          const selected = selection[option.key] === v.id;
          // A colour with no available length at all is a dead end — disable
          // the swatch itself (edge case row 6), not just the current combo.
          const deadEnd = !optionValueHasAnyStock(product, option.key, v.id);
          const disabled = state !== "available" && deadEnd;
          const hatched = state === "nonexistent";
          const struck = state === "soldout";

          return (
            <button
              key={v.id}
              type="button"
              aria-label={`${v.label}${disabled ? (hatched ? " — not made in this combination" : " — sold out") : ""}`}
              aria-pressed={selected}
              aria-disabled={disabled}
              title={disabled ? (hatched ? "Not made in this combination." : "Sold out.") : v.label}
              disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              onClick={() => !disabled && onSelect(v.id)}
              style={{
                width: 38,
                height: 38,
                minWidth: 44,
                minHeight: 44,
                borderRadius: 999,
                background: v.hex || "#ccc",
                border: selected ? "3px solid var(--gold-700)" : "2px solid rgba(46,43,37,0.18)",
                opacity: disabled ? 0.38 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
                position: "relative",
                padding: 0,
                backgroundImage: hatched
                  ? "repeating-linear-gradient(45deg, rgba(46,43,37,0.4) 0 2px, transparent 2px 6px)"
                  : undefined,
              }}
            >
              {struck && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ width: "120%", height: 2, background: "rgba(46,43,37,0.6)", transform: "rotate(-45deg)" }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
