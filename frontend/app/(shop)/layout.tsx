// Customer-facing route group. Fetches settings once, server-side, and
// passes them to the client chrome. No admin imports here whatsoever —
// see plans/05-admin-panel.md §1.
import SiteChrome from "@/components/SiteChrome";
import { getSettings } from "@/lib/products";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings().catch(() => null);
  return <SiteChrome settings={settings}>{children}</SiteChrome>;
}
