"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { adminGetOrder, adminResendEmail, adminUpdateOrder } from "@/lib/admin-api";
import type { AdminOrderDetail } from "@/lib/admin-types";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "@/lib/admin-types";
import { fmt } from "@/lib/format";
import { whatsappUrl } from "@/lib/whatsapp";

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  function refresh() {
    adminGetOrder(params.id).then(setOrder);
  }
  useEffect(refresh, [params.id]);

  if (!order) return <p>Loading…</p>;

  async function updateStatus(field: "status" | "paymentStatus", value: string) {
    const updated = await adminUpdateOrder(order!.id, { [field]: value });
    setOrder(updated);
  }

  async function resend() {
    setResending(true);
    setResendMsg(null);
    try {
      const res = await adminResendEmail(order!.id);
      setResendMsg(`Email status: ${res.emailStatus}`);
      refresh();
    } finally {
      setResending(false);
    }
  }

  const customerPhoneDigits = order.customerPhone.replace(/\D/g, "");

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{order.orderNumber}</h1>
      <p style={{ color: "#8a8f99", fontSize: 13, marginBottom: 20 }}>{new Date(order.createdAt).toLocaleString()}</p>

      {order.emailStatus !== "sent" && (
        <div style={{ background: "#fdecea", color: "#8a2c1a", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          Email status: {order.emailStatus}{order.emailError ? ` — ${order.emailError}` : ""}
          <button onClick={resend} disabled={resending} style={{ marginLeft: 12, background: "#8a2c1a", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
            {resending ? "Resending…" : "Resend email"}
          </button>
        </div>
      )}
      {resendMsg && <p style={{ fontSize: 12, color: "#2d7a3a", marginBottom: 12 }}>{resendMsg}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <section style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 14, margin: "0 0 10px" }}>Customer</h2>
          <p style={{ margin: "0 0 4px", fontSize: 14 }}>{order.customerName}</p>
          <p style={{ margin: "0 0 4px", fontSize: 14 }}>
            <a href={`tel:${customerPhoneDigits}`}>{order.customerPhone}</a>
          </p>
          <p style={{ margin: "0 0 4px", fontSize: 14 }}>{order.customerEmail}</p>
          <p style={{ margin: "0 0 4px", fontSize: 14 }}>
            {order.address}, {order.city} {order.postalCode || ""}
          </p>
          {order.note && <p style={{ margin: "8px 0 0", fontSize: 13, fontStyle: "italic" }}>Note: {order.note}</p>}
          <a
            href={whatsappUrl(`Hi ${order.customerName}, about your order ${order.orderNumber}...`, customerPhoneDigits)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: "#2d7a3a" }}
          >
            Message on WhatsApp
          </a>
        </section>

        <section style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 14, margin: "0 0 10px" }}>Status</h2>
          <label style={{ display: "block", fontSize: 12, color: "#565a63", marginBottom: 4 }}>Fulfilment</label>
          <select value={order.status} onChange={(e) => updateStatus("status", e.target.value)} style={selectStyle}>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label style={{ display: "block", fontSize: 12, color: "#565a63", margin: "12px 0 4px" }}>Payment</label>
          <select value={order.paymentStatus} onChange={(e) => updateStatus("paymentStatus", e.target.value)} style={selectStyle}>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: "#8a8f99", marginTop: 10 }}>Method: {order.paymentMethod}</p>
        </section>
      </div>

      <section style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, margin: "0 0 12px" }}>Items</h2>
        {order.items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: i < order.items.length - 1 ? "1px solid #eef0f3" : "none" }}>
            {item.imageUrl && (
              <div style={{ position: "relative", width: 40, height: 40, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                <Image src={item.imageUrl} alt={item.productName} fill sizes="40px" style={{ objectFit: "cover" }} />
              </div>
            )}
            <div style={{ flex: 1, fontSize: 13 }}>
              {item.productName}{item.selectionLabel ? ` — ${item.selectionLabel}` : ""}
              <div style={{ color: "#8a8f99", fontSize: 12 }}>SKU {item.sku}</div>
            </div>
            <div style={{ fontSize: 13 }}>× {item.qty}</div>
            <div style={{ fontSize: 13, width: 80, textAlign: "right" }}>{fmt(item.lineTotal)}</div>
          </div>
        ))}
        <div style={{ borderTop: "1px solid #e2e4e9", marginTop: 10, paddingTop: 10, fontSize: 13 }}>
          <Row label="Subtotal" value={fmt(order.subtotal)} />
          {order.discountAmount > 0 && <Row label={`Discount${order.discountCode ? " (" + order.discountCode + ")" : ""}`} value={"−" + fmt(order.discountAmount)} />}
          <Row label={order.shippingLabel ? `Delivery (${order.shippingLabel})` : "Delivery"} value={order.deliveryFee === 0 ? "Free" : fmt(order.deliveryFee)} />
          <Row label="Total" value={fmt(order.total)} bold />
        </div>
      </section>
    </div>
  );
}

const selectStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 13 };

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontWeight: bold ? 600 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
