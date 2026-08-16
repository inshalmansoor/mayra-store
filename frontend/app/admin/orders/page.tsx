"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminListOrders } from "@/lib/admin-api";
import type { AdminOrderList } from "@/lib/admin-types";
import { ORDER_STATUSES } from "@/lib/admin-types";
import { fmt } from "@/lib/format";

export default function AdminOrdersPage() {
  const [data, setData] = useState<AdminOrderList | null>(null);
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    adminListOrders(status || undefined, page).then(setData);
  }, [status, page]);

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Orders</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => { setStatus(""); setPage(1); }} style={chip(status === "")}>All</button>
        {ORDER_STATUSES.map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }} style={chip(status === s)}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, overflow: "hidden" }}>
        {data?.orders.map((o) => (
          <Link
            key={o.id}
            href={`/admin/orders/${o.id}`}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #eef0f3", fontSize: 14, color: "#1a1a1a" }}
          >
            <span style={{ minWidth: 100 }}>{o.orderNumber}</span>
            <span style={{ flex: 1 }}>{o.customerName}</span>
            <span style={{ width: 90, color: "#565a63" }}>{new Date(o.createdAt).toLocaleDateString()}</span>
            <span style={{ width: 100 }}>{fmt(o.total)}</span>
            <span style={{ width: 90, color: "#565a63" }}>{o.paymentMethod}</span>
            <span style={{ width: 90 }}>{o.status}</span>
            {o.emailStatus !== "sent" && <span style={{ color: "#c0392b", fontSize: 12 }}>email {o.emailStatus}</span>}
          </Link>
        ))}
        {data && data.orders.length === 0 && <p style={{ padding: 16, color: "#8a8f99", fontSize: 14 }}>No orders.</p>}
      </div>

      {data && data.total > data.pageSize && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={chip(false)}>
            Previous
          </button>
          <button disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)} style={chip(false)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 999,
    border: active ? "1px solid #1a1a1a" : "1px solid #d0d3d9",
    background: active ? "#1a1a1a" : "#fff",
    color: active ? "#fff" : "#1a1a1a",
    fontSize: 12,
    cursor: "pointer",
  };
}
