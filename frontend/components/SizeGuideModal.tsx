"use client";

import { useEffect, useRef } from "react";

export default function SizeGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rows = [
    { label: "16\" — Choker", desc: "Sits high, right at the base of the neck." },
    { label: "18\" — Collarbone", desc: "The most common length — rests along the collarbone." },
    { label: "20\" — Below collarbone", desc: "A little lower, layers well under a 16\" or 18\"." },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Size guide"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(46,43,37,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", borderRadius: 10, padding: 28, width: "min(420px,92vw)", maxHeight: "85vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Necklace length guide</h3>
          <button ref={closeBtnRef} aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", minWidth: 44, minHeight: 44 }}>
            ✕
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <svg width="40" height="52" viewBox="0 0 40 52" style={{ flexShrink: 0 }}>
                <path d="M20 4 C 10 4, 6 16, 6 24 C 6 34, 13 40, 20 40" fill="none" stroke="#c8a24a" strokeWidth="2" />
                <circle cx="20" cy="4" r="3" fill="#2e2b25" />
              </svg>
              <div>
                <div style={{ fontFamily: "var(--font-caps)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>{r.label}</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink-soft)" }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
