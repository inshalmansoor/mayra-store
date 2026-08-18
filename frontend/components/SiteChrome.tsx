"use client";

import Header from "./Header";
import Footer from "./Footer";
import MobileTabBar from "./MobileTabBar";
import AnnouncementBar from "./AnnouncementBar";
import PromoPopup from "./PromoPopup";
import type { StoreSettings } from "@/lib/types";

export default function SiteChrome({
  settings,
  children,
}: {
  settings: StoreSettings | null;
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      {settings && <AnnouncementBar text={settings.announcement.text} enabled={settings.announcement.enabled} />}
      {settings?.promoPopupEnabled && <PromoPopup discountCode={settings.discountCode} />}
      <main style={{ minHeight: "60vh" }}>{children}</main>
      <Footer whatsappNumber={settings?.whatsappNumber ?? ""} />
      <MobileTabBar />
    </>
  );
}
