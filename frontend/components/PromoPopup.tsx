"use client";

// Launch poster modal — plans/04-frontend-nextjs.md §9.1. Focus trap,
// Escape closes, backdrop click closes, prefers-reduced-motion respected.
import { useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePromo } from "@/context/PromoContext";

export default function PromoPopup({ discountCode }: { discountCode: string }) {
  const { popupOpen, closePopup } = usePromo();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!popupOpen) return;
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePopup();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popupOpen, closePopup]);

  if (!popupOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Launch offer"
      onClick={closePopup}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(46,43,37,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(420px, 90vw)",
          maxHeight: "90vh",
          background: "var(--surface)",
          borderRadius: 10,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <button
          ref={closeBtnRef}
          aria-label="Close"
          onClick={closePopup}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 1,
            width: 44,
            height: 44,
            borderRadius: 999,
            border: "none",
            background: "rgba(253,248,239,0.9)",
            color: "var(--ink)",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
          <Image src="/brand/launch-poster.jpg" alt="Mayra launch offer — 20% off with code MAYRA20" fill sizes="420px" style={{ objectFit: "cover" }} priority />
        </div>
        <div style={{ padding: 16 }}>
          <button
            onClick={() => {
              closePopup();
              router.push(`/shop?discount=${encodeURIComponent(discountCode)}`);
            }}
            style={{
              width: "100%",
              background: "var(--gold-500)",
              color: "#2e2b25",
              border: "none",
              borderRadius: 999,
              padding: "13px 20px",
              fontFamily: "var(--font-caps)",
              fontSize: 13,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Shop with 20% off
          </button>
        </div>
      </div>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          [role="dialog"] > div { animation: promo-in 0.22s ease; }
        }
        @keyframes promo-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
