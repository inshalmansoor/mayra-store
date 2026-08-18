import Link from "next/link";
import InstagramStrip from "./InstagramStrip";

export default function Footer({ whatsappNumber }: { whatsappNumber: string }) {
  return (
    <footer>
      <InstagramStrip />
      <div style={{ background: "var(--forest-700)", color: "#f5ead8" }}>
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "40px 20px 100px",
            display: "grid",
            gap: 28,
            gridTemplateColumns: "1fr",
          }}
          className="footer-grid"
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                letterSpacing: "var(--tracking-wordmark)",
                marginBottom: 10,
              }}
            >
              MAYRA
            </div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--gold-300)", maxWidth: 320 }}>
              Jewels that speak for you. 18k gold-plated stainless steel, made to be worn every day.
            </p>
          </div>

          <div>
            <div style={{ fontFamily: "var(--font-caps)", fontSize: 12, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase", color: "var(--gold-300)" }}>
              Shop
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <li><Link href="/shop" style={{ color: "#f5ead8" }}>All pieces</Link></li>
              <li><Link href="/golden-essence" style={{ color: "#f5ead8" }}>Golden Essence</Link></li>
              <li><Link href="/wishlist" style={{ color: "#f5ead8" }}>Wishlist</Link></li>
            </ul>
          </div>

          <div>
            <div style={{ fontFamily: "var(--font-caps)", fontSize: 12, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase", color: "var(--gold-300)" }}>
              About
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <li><Link href="/about" style={{ color: "#f5ead8" }}>Our story</Link></li>
              <li><Link href="/about#delivery" style={{ color: "#f5ead8" }}>Delivery</Link></li>
              <li><Link href="/about#returns" style={{ color: "#f5ead8" }}>Returns</Link></li>
            </ul>
          </div>

          <div>
            <div style={{ fontFamily: "var(--font-caps)", fontSize: 12, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase", color: "var(--gold-300)" }}>
              Contact
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {whatsappNumber && (
                <li>
                  <a href={`https://wa.me/${whatsappNumber}`} style={{ color: "#f5ead8" }}>
                    WhatsApp
                  </a>
                </li>
              )}
              <li>
                <a href={process.env.NEXT_PUBLIC_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#f5ead8" }}>
                  Instagram
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <style>{`
        @media (min-width: 768px) {
          .footer-grid { grid-template-columns: 2fr 1fr 1fr 1fr !important; padding-bottom: 40px !important; }
        }
      `}</style>
    </footer>
  );
}
