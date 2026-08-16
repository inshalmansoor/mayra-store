"use client";

import { useEffect, useState } from "react";
import { adminListNotifyRequests } from "@/lib/admin-api";
import type { AdminNotifyRequest } from "@/lib/admin-types";

export default function AdminNotifyRequestsPage() {
  const [rows, setRows] = useState<AdminNotifyRequest[]>([]);

  useEffect(() => {
    adminListNotifyRequests().then(setRows);
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Restock requests</h1>
      <p style={{ fontSize: 13, color: "#8a8f99", marginBottom: 16 }}>
        Customers who asked to be emailed when a sold-out piece is back.
      </p>
      <div style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, overflow: "hidden" }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #eef0f3", fontSize: 14 }}>
            <span>{r.productName}</span>
            <span style={{ color: "#565a63" }}>{r.email}</span>
            <span style={{ color: "#8a8f99", fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
        {rows.length === 0 && <p style={{ padding: 16, color: "#8a8f99", fontSize: 14 }}>No requests yet.</p>}
      </div>
    </div>
  );
}
