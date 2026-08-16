"use client";

// Bottom tab bar on mobile — Shop · Saved · Bag — keeping primary actions
// inside thumb reach. See plans/04-frontend-nextjs.md §6.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";

const TABS = [
  {
    href: "/shop",
    label: "Shop",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    href: "/wishlist",
    label: "Saved",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
      </svg>
    ),
  },
  {
    href: "/cart",
    label: "Bag",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M4 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L22 8H6" />
        <circle cx="9" cy="21" r="1" />
        <circle cx="18" cy="21" r="1" />
      </svg>
    ),
  },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  const { count: cartCount } = useCart();
  const { count: wishCount } = useWishlist();

  if (pathname.startsWith("/admin")) return null;

  const counts: Record<string, number> = { "/wishlist": wishCount, "/cart": cartCount };

  return (
    <nav
      aria-label="Primary"
      className="mobile-tab-bar"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: "var(--surface)",
        borderTop: "1px solid var(--line)",
        display: "flex",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        const count = counts[tab.href] ?? 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "10px 0 8px",
              color: active ? "var(--gold-700)" : "var(--ink-soft)",
              minHeight: 44,
              position: "relative",
            }}
          >
            <span style={{ position: "relative" }}>
              {tab.icon}
              {count > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -8,
                    minWidth: 15,
                    height: 15,
                    borderRadius: 999,
                    background: "var(--forest-500)",
                    color: "#fff",
                    fontSize: 9,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-caps)",
                  }}
                >
                  {count}
                </span>
              )}
            </span>
            <span style={{ fontFamily: "var(--font-caps)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {tab.label}
            </span>
          </Link>
        );
      })}
      <style>{`
        @media (min-width: 768px) {
          .mobile-tab-bar { display: none !important; }
        }
      `}</style>
    </nav>
  );
}
