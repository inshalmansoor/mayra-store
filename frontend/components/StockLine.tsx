// "Only 2 left" / "In stock" / "Sold out" — plans/04 §7 row 7. Real number,
// never randomised; silent when there's plenty. aria-live so screen readers
// hear it change when the selection changes.
export default function StockLine({ stock, soldOut, lowStockAt = 3 }: { stock: number; soldOut: boolean; lowStockAt?: number }) {
  if (soldOut) {
    return (
      <span aria-live="polite" style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--ink-soft)" }}>
        Sold out
      </span>
    );
  }
  if (stock > 0 && stock <= lowStockAt) {
    return (
      <span aria-live="polite" style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--clay-500)" }}>
        Only {stock} left
      </span>
    );
  }
  return (
    <span aria-live="polite" style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--forest-500)" }}>
      In stock
    </span>
  );
}
