"use client";

// Promo popup + announcement bar state — shared globally so the header's
// "20% OFF" chip can reopen the popup from any page. See
// plans/04-frontend-nextjs.md §9.1-9.2. The popup firing "every visit" on
// landing only is handled by the landing page itself calling openPopup()
// on mount — this context only holds the open/closed state.
import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface PromoContextValue {
  popupOpen: boolean;
  announcementVisible: boolean;
  openPopup: () => void;
  closePopup: () => void;
  dismissAnnouncement: () => void;
}

const PromoContext = createContext<PromoContextValue | null>(null);

export function PromoProvider({ children }: { children: React.ReactNode }) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [announcementVisible, setAnnouncementVisible] = useState(false);

  const openPopup = useCallback(() => setPopupOpen(true), []);
  const closePopup = useCallback(() => {
    setPopupOpen(false);
    setAnnouncementVisible(true);
  }, []);
  const dismissAnnouncement = useCallback(() => setAnnouncementVisible(false), []);

  const value = useMemo(
    () => ({ popupOpen, announcementVisible, openPopup, closePopup, dismissAnnouncement }),
    [popupOpen, announcementVisible, openPopup, closePopup, dismissAnnouncement],
  );

  return <PromoContext.Provider value={value}>{children}</PromoContext.Provider>;
}

export function usePromo(): PromoContextValue {
  const ctx = useContext(PromoContext);
  if (!ctx) throw new Error("usePromo must be used within PromoProvider");
  return ctx;
}
