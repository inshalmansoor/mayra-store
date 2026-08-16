// Capped per plans/04 §7 rows 8-9: `+` disabled at stock cap, cap accounts
// for quantity already in the bag.
export default function QtyStepper({
  qty,
  onChange,
  cap,
}: {
  qty: number;
  onChange: (next: number) => void;
  cap: number;
}) {
  const atCap = qty >= cap;
  return (
    <div>
      <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: 999 }}>
        <button
          aria-label="Decrease quantity"
          onClick={() => onChange(Math.max(1, qty - 1))}
          disabled={qty <= 1}
          style={{
            width: 40,
            height: 40,
            border: "none",
            background: "none",
            fontSize: 18,
            cursor: qty <= 1 ? "not-allowed" : "pointer",
            opacity: qty <= 1 ? 0.4 : 1,
          }}
        >
          −
        </button>
        <span style={{ minWidth: 28, textAlign: "center", fontFamily: "var(--font-body)", fontSize: 16 }}>{qty}</span>
        <button
          aria-label="Increase quantity"
          onClick={() => onChange(Math.min(cap, qty + 1))}
          disabled={atCap}
          style={{
            width: 40,
            height: 40,
            border: "none",
            background: "none",
            fontSize: 18,
            cursor: atCap ? "not-allowed" : "pointer",
            opacity: atCap ? 0.4 : 1,
          }}
        >
          +
        </button>
      </div>
      {atCap && cap > 0 && (
        <div style={{ fontFamily: "var(--font-caps)", fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
          {cap} available
        </div>
      )}
    </div>
  );
}
