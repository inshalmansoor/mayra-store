"use client";

import { useRouter } from "next/navigation";
import { usePromo } from "@/context/PromoContext";

export default function AnnouncementBar({ text, enabled }: { text: string; enabled: boolean }) {
  const { announcementVisible, dismissAnnouncement } = usePromo();
  const router = useRouter();

  if (!enabled || !announcementVisible || !text) return null;

  return (
    <div
      style={{
        background: "var(--forest-700)",
        color: "#fdf8ef",
        padding: "9px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        fontFamily: "var(--font-caps)",
        fontSize: 12,
        letterSpacing: "0.04em",
        position: "relative",
      }}
    >
      <span style={{ textAlign: "center" }}>{text}</span>
      <button
        onClick={() => router.push("/shop?discount=1")}
        style={{
          background: "none",
          border: "none",
          textDecoration: "underline",
          color: "var(--gold-300)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "inherit",
          padding: 0,
        }}
      >
        Shop now
      </button>
      <button
        aria-label="Dismiss announcement"
        onClick={dismissAnnouncement}
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          color: "#fdf8ef",
          cursor: "pointer",
          minWidth: 32,
          minHeight: 32,
        }}
      >
        ✕
      </button>
    </div>
  );
}
