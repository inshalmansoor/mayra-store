import Image from "next/image";
import WhatsAppButton from "@/components/WhatsAppButton";
import { generalInquiryUrl } from "@/lib/whatsapp";

export const metadata = { title: "About" };

export default function AboutPage() {
  const instagramUrl = process.env.NEXT_PUBLIC_INSTAGRAM_URL || "https://www.instagram.com/mayra_.jewels/";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 80px" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", marginBottom: 32 }}>
        <Image src="/brand/wordmark-dark.jpg" alt="Mayra — jewels that speak for you" fill sizes="720px" style={{ objectFit: "cover" }} priority />
      </div>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, marginBottom: 20 }}>Our story</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 17, lineHeight: 1.75, marginBottom: 20 }}>
        Mayra started as a small idea in August 2025 — jewellery that feels personal rather than mass-produced, priced
        so it can actually be worn every day instead of saved for one occasion. Every piece is chosen and put together
        with that in mind: simple enough to layer, detailed enough to notice.
      </p>

      <h2 style={{ fontFamily: "var(--font-caps)", fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 36, marginBottom: 14 }}>
        What it&rsquo;s made of
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.75, marginBottom: 12 }}>
        Every piece is 18k gold-plated stainless steel. Stainless steel doesn&rsquo;t tarnish or turn green the way
        brass or plain alloy does, and it&rsquo;s a safe base for most skin types — including sensitive skin that reacts
        to cheaper metals.
      </p>
      <ul style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.9, paddingLeft: 20, marginBottom: 12 }}>
        <li>Remove before showering or swimming</li>
        <li>Keep away from perfume and lotion — the plating lasts longer without direct chemical contact</li>
        <li>Store dry, in the pouch it arrives in</li>
      </ul>

      <h2 id="delivery" style={{ fontFamily: "var(--font-caps)", fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 36, marginBottom: 14 }}>
        Delivery
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.75, marginBottom: 12 }}>
        We deliver across Pakistan, 3–5 working days depending on your city. Delivery is Rs 250, free on orders over
        Rs 5,000. Cash on delivery, bank transfer and card are all accepted at checkout — card payments on this site
        are a demonstration only; no charge is ever made.
      </p>

      <h2 id="returns" style={{ fontFamily: "var(--font-caps)", fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 36, marginBottom: 14 }}>
        Returns and exchanges
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.75, marginBottom: 32 }}>
        If something isn&rsquo;t right, unworn pieces in their original packaging can be exchanged within 3 days of
        delivery. Message us on WhatsApp with your order number and we&rsquo;ll sort out the details.
      </p>

      <h2 style={{ fontFamily: "var(--font-caps)", fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
        Contact
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
        <WhatsAppButton href={generalInquiryUrl()} />
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, border: "1px solid var(--line)", color: "var(--ink)", borderRadius: 999, fontFamily: "var(--font-caps)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          Instagram
        </a>
      </div>
    </div>
  );
}
