"use client";

import { useState } from "react";

export default function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: "1px solid var(--line)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          minHeight: 44,
        }}
      >
        <span style={{ fontFamily: "var(--font-caps)", fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink)" }}>
          {title}
        </span>
        <span style={{ fontSize: 18, color: "var(--ink-soft)", transform: open ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>
          +
        </span>
      </button>
      {open && <div style={{ paddingBottom: 16, fontFamily: "var(--font-body)", fontSize: 15, color: "var(--ink)", lineHeight: 1.6 }}>{children}</div>}
    </div>
  );
}
