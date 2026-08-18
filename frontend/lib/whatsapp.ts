// wa.me link builder. The store's number is an admin-editable setting
// (fetched from /api/settings at runtime), never a build-time env var or a
// hardcoded fallback — every call site here must pass it in explicitly.
import type { CartLineComputed } from "./types";

export function whatsappUrl(text: string, number: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function generalInquiryUrl(number: string): string {
  return whatsappUrl("Hi Mayra! I have a question about a piece.", number);
}

export function buildOrderWhatsAppUrl(lines: CartLineComputed[], totalLabel: string, number: string): string {
  const body = lines
    .filter((l) => l.available)
    .map((l) => `• ${l.product?.name ?? ""}${l.selectionLabel ? " — " + l.selectionLabel : ""} × ${l.qty} — ${l.lineTotalLabel}`)
    .join("\n");
  const text = `Hi Mayra! I'd like to order:\n\n${body}\n\nTotal: ${totalLabel}\n\nName:\nAddress:`;
  return whatsappUrl(text, number);
}

export function buildOrderConfirmedWhatsAppUrl(orderNumber: string, number: string): string {
  return whatsappUrl(`Hi Mayra! About my order ${orderNumber}...`, number);
}
