// wa.me link builder. Number comes from NEXT_PUBLIC_WHATSAPP_NUMBER — never
// hardcode it (the prototype's placeholder 923001234567 must not survive
// the port). See plans/04-frontend-nextjs.md §4.2, PLAN.md.
import type { CartLineComputed } from "./types";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "923113136446";

export function whatsappUrl(text: string, number: string = WHATSAPP_NUMBER): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function generalInquiryUrl(): string {
  return whatsappUrl("Hi Mayra! I have a question about a piece.");
}

export function buildOrderWhatsAppUrl(lines: CartLineComputed[], totalLabel: string): string {
  const body = lines
    .filter((l) => l.available)
    .map((l) => `• ${l.product?.name ?? ""}${l.selectionLabel ? " — " + l.selectionLabel : ""} × ${l.qty} — ${l.lineTotalLabel}`)
    .join("\n");
  const text = `Hi Mayra! I'd like to order:\n\n${body}\n\nTotal: ${totalLabel}\n\nName:\nAddress:`;
  return whatsappUrl(text);
}

export function buildOrderConfirmedWhatsAppUrl(orderNumber: string): string {
  return whatsappUrl(`Hi Mayra! About my order ${orderNumber}...`);
}
