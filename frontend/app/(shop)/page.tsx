import Image from "next/image";
import Link from "next/link";
import { getProducts } from "@/lib/products";
import CatalogueGrid from "@/components/CatalogueGrid";
import LandingPopupTrigger from "@/components/LandingPopupTrigger";

const CATEGORY_DOORS = [
  { slug: "necklaces", label: "Necklaces" },
  { slug: "bracelets", label: "Bracelets" },
  { slug: "rings", label: "Rings" },
  { slug: "earrings", label: "Earrings" },
];

export default async function LandingPage() {
  const products = await getProducts().catch(() => []);
  const featured = products.filter((p) => p.isFeatured).slice(0, 4);

  return (
    <div>
      <LandingPopupTrigger />

      {/* Hero — quiet, per plans/04 §21: type and jewellery carry it, not a stacked banner */}
      <section style={{ padding: "56px 20px 40px", textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(34px, 8vw, 64px)",
            lineHeight: 1.08,
            margin: "0 0 18px",
            color: "var(--ink)",
          }}
        >
          Jewels that speak
          <br />
          for you.
        </h1>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, margin: "0 0 14px" }}>
          <span style={{ width: 40, height: 1, background: "var(--gold-500)" }} />
          <span style={{ color: "var(--gold-500)" }}>✦</span>
          <span style={{ width: 40, height: 1, background: "var(--gold-500)" }} />
        </div>
        <p style={{ fontFamily: "var(--font-script)", fontSize: "clamp(22px, 5vw, 32px)", color: "var(--forest-500)", margin: "0 0 30px" }}>
          every piece, a part of you
        </p>
        <Link
          href="/shop"
          style={{
            display: "inline-block",
            background: "var(--gold-500)",
            color: "#2e2b25",
            padding: "14px 32px",
            borderRadius: 999,
            fontFamily: "var(--font-caps)",
            fontSize: 13,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Enter the collection
        </Link>
      </section>

      {/* Category doors */}
      <section style={{ padding: "0 20px 48px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }} className="doors-grid">
          {CATEGORY_DOORS.map((d) => (
            <Link
              key={d.slug}
              href={`/shop?category=${d.slug}`}
              style={{
                position: "relative",
                aspectRatio: "4 / 3",
                borderRadius: 10,
                overflow: "hidden",
                background: "var(--gold-100)",
                display: "flex",
                alignItems: "flex-end",
                padding: 16,
                color: "var(--ink)",
              }}
            >
              <span style={{ fontFamily: "var(--font-display)", fontSize: 20, position: "relative", zIndex: 1 }}>{d.label}</span>
            </Link>
          ))}
        </div>
        <style>{`
          @media (min-width: 768px) { .doors-grid { grid-template-columns: repeat(4, 1fr) !important; } }
        `}</style>
      </section>

      {/* Tracked-caps strip */}
      <section style={{ background: "var(--forest-700)", padding: "22px 20px", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 28,
            flexWrap: "wrap",
            fontFamily: "var(--font-caps)",
            fontSize: 12,
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            color: "var(--gold-300)",
          }}
        >
          <span>Timeless designs</span>
          <span>Premium quality</span>
          <span>Made for you</span>
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section style={{ padding: "48px 20px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, justifyContent: "center" }}>
              <span style={{ color: "var(--gold-500)" }}>✦</span>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: 0, textAlign: "center" }}>Four featured pieces</h2>
            </div>
            <CatalogueGrid products={featured} />
          </div>
        </section>
      )}

      {/* Brand poster strip */}
      <section style={{ padding: "0 20px 48px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", position: "relative", aspectRatio: "4 / 3", borderRadius: 12, overflow: "hidden" }}>
          <Image src="/brand/hero-poster.jpg" alt="Mayra — every piece, a part of you" fill sizes="(max-width: 900px) 100vw, 900px" style={{ objectFit: "cover" }} />
        </div>
      </section>
    </div>
  );
}
