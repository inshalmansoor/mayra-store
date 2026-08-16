"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { usePromo } from "@/context/PromoContext";
import SearchOverlay from "./SearchOverlay";

const NAV = [
  { href: "/shop", label: "Shop" },
  { href: "/golden-essence", label: "Golden Essence" },
  { href: "/about", label: "About" },
];

function IconButton({
  label,
  onClick,
  href,
  count,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  count?: number;
  children: React.ReactNode;
}) {
  const inner = (
    <span
      style={{
        position: "relative",
        width: 40,
        height: 40,
        minWidth: 44,
        minHeight: 44,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ink)",
      }}
    >
      {children}
      {!!count && count > 0 && (
        <span
          aria-live="polite"
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            minWidth: 16,
            height: 16,
            borderRadius: 999,
            background: "var(--forest-500)",
            color: "#fff",
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-caps)",
            padding: "0 3px",
          }}
        >
          {count}
        </span>
      )}
    </span>
  );

  const style: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", padding: 0 };

  if (href) {
    return (
      <Link href={href} aria-label={label} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <button aria-label={label} onClick={onClick} style={style}>
      {inner}
    </button>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { count: cartCount } = useCart();
  const { count: wishCount } = useWishlist();
  const { openPopup } = usePromo();
  const [searchOpen, setSearchOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "rgba(245,234,216,0.94)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid rgba(46,43,37,0.12)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <Link
            href="/"
            style={{
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              fontSize: 24,
              letterSpacing: "var(--tracking-wordmark)",
              fontWeight: 600,
              color: "var(--ink)",
            }}
          >
            MAYRA
          </Link>

          <nav
            aria-label="Primary"
            style={{
              display: "none",
              gap: 22,
              marginLeft: 8,
              fontFamily: "var(--font-caps)",
              fontSize: 13,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
            className="desktop-nav"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  color: "var(--ink)",
                  paddingBottom: 4,
                  borderBottom: isActive(item.href) ? "2px solid var(--gold-500)" : "2px solid transparent",
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            <button
              onClick={openPopup}
              style={{
                cursor: "pointer",
                fontFamily: "var(--font-caps)",
                fontSize: 11,
                letterSpacing: "0.08em",
                background: "var(--gold-100)",
                color: "var(--gold-700)",
                padding: "6px 12px",
                borderRadius: 999,
                fontWeight: 500,
                border: "none",
              }}
            >
              20% OFF
            </button>
            <IconButton label="Search" onClick={() => setSearchOpen(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </IconButton>
            <IconButton label="Wishlist" href="/wishlist" count={wishCount}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
            </IconButton>
            <IconButton label="Bag" href="/cart" count={cartCount}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </IconButton>
          </div>
        </div>
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={(href) => router.push(href)} />

      <style>{`
        @media (min-width: 768px) {
          .desktop-nav { display: flex !important; }
        }
      `}</style>
    </>
  );
}
