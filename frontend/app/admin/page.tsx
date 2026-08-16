"use client";

// Five numbers + the last ten orders, above the fold — plans/05-admin-panel.md
// §4. Computed client-side from the list endpoints; this app's scale doesn't
// warrant a dedicated aggregation endpoint.
import { useEffect, useState } from "react";
import Link from "next/link";
import { adminListOrders, adminListProducts } from "@/lib/admin-api";
import type { AdminOrderSummary, AdminProduct } from "@/lib/admin-types";
import { fmt } from "@/lib/format";

export default function AdminDashboard() {
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminListOrders(undefined, 1), adminListProducts()])
      .then(([o, p]) => {
        setOrders(o.orders);
        setProducts(p);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;

  const today = new Date().toDateString();
  const newOrders = orders.filter((o) => o.status === "new").length;
  const ordersToday = orders.filter((o) => new Date(o.createdAt).toDateString() === today).length;
  const outOfStockProducts = products.filter((p) => p.isActive && p.variants.every((v) => v.stock === 0)).length;
  const lowStockVariants = products.flatMap((p) => p.variants).filter((v) => v.stock > 0 && v.stock <= 3).length;
  const emailIssues = orders.filter((o) => o.emailStatus !== "sent").length;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 32 }}>
        <StatCard label="New orders" value={newOrders} />
        <StatCard label="Orders today" value={ordersToday} />
        <StatCard label="Out of stock" value={outOfStockProducts} />
        <StatCard label="Low stock variants" value={lowStockVariants} />
        <StatCard label="Email issues" value={emailIssues} alert={emailIssues > 0} />
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Recent orders</h2>
      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e4e9", overflow: "hidden" }}>
        {orders.slice(0, 10).map((o) => (
          <Link
            key={o.id}
            href={`/admin/orders/${o.id}`}
            style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #eef0f3", fontSize: 14, color: "#1a1a1a" }}
          >
            <span>{o.orderNumber} · {o.customerName}</span>
            <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {o.emailStatus !== "sent" && <span style={{ color: "#c0392b", fontSize: 12 }}>email {o.emailStatus}</span>}
              <span style={{ color: "#565a63" }}>{o.status}</span>
              <span>{fmt(o.total)}</span>
            </span>
          </Link>
        ))}
        {orders.length === 0 && <p style={{ padding: 16, color: "#8a8f99", fontSize: 14 }}>No orders yet.</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${alert && value > 0 ? "#f3c6c1" : "#e2e4e9"}`, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: alert && value > 0 ? "#c0392b" : "#1a1a1a" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#8a8f99" }}>{label}</div>
    </div>
  );
}
