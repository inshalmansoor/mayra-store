"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/notify-requests", label: "Notify requests" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminShell({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 210, borderRight: "1px solid #e2e4e9", padding: "20px 14px", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 24, padding: "0 8px" }}>Mayra Admin</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "9px 10px",
                  borderRadius: 6,
                  fontSize: 14,
                  color: active ? "#1a1a1a" : "#565a63",
                  background: active ? "#eceef2" : "transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={onLogout}
          style={{ marginTop: 24, width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 6, fontSize: 13, color: "#8a8f99", background: "none", border: "none", cursor: "pointer" }}
        >
          Log out
        </button>
      </aside>
      <main style={{ flex: 1, padding: "28px 32px", minWidth: 0 }}>{children}</main>
    </div>
  );
}
