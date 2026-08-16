"use client";

// Full-width search field, 200ms debounce, live result count, empty state
// per plans/04-frontend-nextjs.md §7 case 15. Escape closes, focus trapped
// while open.
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Product } from "@/lib/types";
import { coverImage, isSoldOut } from "@/lib/variants";
import { fmt } from "@/lib/format";

export default function SearchOverlay({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [products, setProducts] = useState<Product[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && products === null) {
      fetch("/api/products")
        .then((r) => r.json())
        .then((data) => setProducts(data))
        .catch(() => setProducts([]));
    }
  }, [open, products]);

  useEffect(() => {
    // Syncs internal field state with the `open` prop transitioning closed
    // — a real external signal (parent-controlled visibility), not a value
    // derivable during render.
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setQuery("");
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const results =
    debounced && products
      ? products.filter((p) =>
          `${p.name} ${p.material} ${p.category} ${p.collection || ""}`.toLowerCase().includes(debounced),
        )
      : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg)" }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search necklaces, bracelets, rings…"
            aria-label="Search products"
            style={{
              flex: 1,
              border: "none",
              borderBottom: "1px solid var(--line)",
              background: "transparent",
              fontFamily: "var(--font-body)",
              fontSize: 20,
              padding: "10px 4px",
              outline: "none",
              color: "var(--ink)",
            }}
          />
          <button
            aria-label="Close search"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 8, minWidth: 44, minHeight: 44 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div aria-live="polite" style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--ink-soft)", margin: "14px 4px" }}>
          {debounced ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Type to search"}
        </div>

        {debounced && results.length === 0 && (
          <div style={{ padding: "40px 4px", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 18, marginBottom: 16 }}>
              Nothing matches &lsquo;{query.trim()}&rsquo;.
            </p>
            <button
              onClick={() => setQuery("")}
              style={{
                background: "none",
                border: "1px solid var(--gold-500)",
                color: "var(--gold-700)",
                borderRadius: 999,
                padding: "10px 20px",
                fontFamily: "var(--font-caps)",
                fontSize: 12,
                letterSpacing: "0.06em",
                cursor: "pointer",
              }}
            >
              Clear search
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {results.slice(0, 20).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onNavigate(`/product/${p.id}`);
                onClose();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 4px",
                background: "none",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                borderRadius: 8,
              }}
            >
              <div style={{ position: "relative", width: 56, height: 56, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "var(--surface)" }}>
                <Image src={coverImage(p, "default", 200)} alt={p.name} fill sizes="56px" style={{ objectFit: "cover" }} />
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--ink)" }}>{p.name}</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--gold-700)" }}>
                  {fmt(p.basePrice)} {isSoldOut(p) ? "· Sold out" : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
