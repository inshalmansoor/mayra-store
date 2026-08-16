"use client";

// Fires the promo popup ~600ms after first paint, every visit, landing page
// only — plans/04-frontend-nextjs.md §9.1. No persistence: mounting this
// component is what "every visit" means.
import { useEffect } from "react";
import { usePromo } from "@/context/PromoContext";

export default function LandingPopupTrigger() {
  const { openPopup } = usePromo();

  useEffect(() => {
    const t = setTimeout(() => openPopup(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
