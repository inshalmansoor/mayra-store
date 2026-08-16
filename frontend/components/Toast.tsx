"use client";

import { useToast } from "@/context/ToastContext";

export default function Toast() {
  const { toast, dismissToast } = useToast();

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
        transform: "translateX(-50%)",
        zIndex: 90,
        pointerEvents: toast ? "auto" : "none",
      }}
    >
      {toast && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            background: "var(--forest-700)",
            color: "#fff",
            borderRadius: 999,
            padding: "12px 18px",
            fontFamily: "var(--font-body)",
            fontSize: 15,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            maxWidth: "min(92vw, 420px)",
          }}
        >
          <span>{toast.message}</span>
          {toast.linkLabel && toast.onLink && (
            <button
              onClick={() => {
                toast.onLink?.();
                dismissToast();
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--gold-300)",
                fontFamily: "var(--font-caps)",
                fontSize: 12,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                textDecoration: "underline",
                padding: 0,
                whiteSpace: "nowrap",
              }}
            >
              {toast.linkLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
