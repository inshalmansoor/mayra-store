"use client";

// Reads the order result from sessionStorage rather than an unauthenticated
// GET /orders/{number} — order numbers are sequential, so a public lookup
// endpoint would let anyone walk them and read every customer's address.
// See plans/04-frontend-nextjs.md §3.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { OrderResult } from "@/lib/types";
import { fmt } from "@/lib/format";
import { buildOrderConfirmedWhatsAppUrl } from "@/lib/whatsapp";
import WhatsAppButton from "@/components/WhatsAppButton";
import { useSettings } from "@/lib/useSettings";

export default function OrderConfirmationPage() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = decodeURIComponent(params.orderNumber);
  const [order, setOrder] = useState<OrderResult | null | undefined>(undefined);
  const { settings } = useSettings();
  const whatsappNumber = settings?.whatsappNumber ?? "";

  useEffect(() => {
    // sessionStorage is a browser API unavailable during render — reading it
    // is unavoidably an effect, not derived state.
    try {
      const raw = window.sessionStorage.getItem(`mayra.order.${orderNumber}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrder(raw ? JSON.parse(raw) : null);
    } catch {
      setOrder(null);
    }
  }, [orderNumber]);

  if (order === undefined) return <div style={{ padding: 60 }} />;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px 80px", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--gold-100)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--gold-700)" strokeWidth={2.5}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: "0 0 6px" }}>Order placed</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--ink-soft)", marginBottom: 28 }}>
        {orderNumber}
      </p>

      {order ? (
        <>
          <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {order.items.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {item.imageUrl && (
                  <div style={{ position: "relative", width: 48, height: 48, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                    <Image src={item.imageUrl} alt={item.productName} fill sizes="48px" style={{ objectFit: "cover" }} />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 15 }}>
                    {item.productName}
                    {item.selectionLabel ? ` — ${item.selectionLabel}` : ""} × {item.qty}
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 15 }}>{fmt(item.lineTotal)}</div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "left", borderTop: "1px solid var(--line)", paddingTop: 14, marginBottom: 28 }}>
            <Row label="Subtotal" value={fmt(order.subtotal)} />
            {order.discountAmount > 0 && <Row label="Discount" value={"−" + fmt(order.discountAmount)} />}
            <Row label={order.shippingLabel ? `Delivery (${order.shippingLabel})` : "Delivery"} value={order.deliveryFee === 0 ? "Free" : fmt(order.deliveryFee)} />
            <Row label="Total" value={fmt(order.total)} big />
          </div>

          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink-soft)", marginBottom: 8 }}>
            Estimated delivery: 3–5 working days.
          </p>
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--ink-soft)", marginBottom: 24 }}>
          Your order was placed successfully. A confirmation email is on its way.
        </p>
      )}

      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink-soft)", marginBottom: 24 }}>
        A confirmation email is on its way to your inbox.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {whatsappNumber && <WhatsAppButton href={buildOrderConfirmedWhatsAppUrl(orderNumber, whatsappNumber)} label="Message us about this order" />}
        <Link
          href="/shop"
          style={{ display: "inline-block", background: "var(--gold-500)", color: "#2e2b25", padding: "13px 20px", borderRadius: 999, fontFamily: "var(--font-caps)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: big ? "var(--font-display)" : "var(--font-body)", fontSize: big ? 18 : 14, padding: "3px 0", fontWeight: big ? 600 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
