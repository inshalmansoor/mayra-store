// Separate surface from the customer site — no shared nav, no shared
// components, noindex. See plans/05-admin-panel.md §1. Deliberately plain
// and dense rather than reusing the storefront's cream/serif theme, so it
// visibly reads as a different application.
import type { Metadata } from "next";
import AdminGate from "@/components/admin/AdminGate";

export const metadata: Metadata = {
  title: "Mayra Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7", color: "#1a1a1a", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <AdminGate>{children}</AdminGate>
    </div>
  );
}
