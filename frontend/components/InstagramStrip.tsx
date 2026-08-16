import Image from "next/image";

// Placeholder tiles reuse product photography — a real feed needs the
// Instagram Graph API, which needs a backend; parked per plans/04 §.
const TILES = [
  "https://images.unsplash.com/photo-1623321673989-830eff0fd59f?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1689367436629-1d288f1e23b6?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1722410180681-9f5a22d7ebb6?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1601121141461-920cb1993441?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=400&q=80",
];

export default function InstagramStrip() {
  const url = process.env.NEXT_PUBLIC_INSTAGRAM_URL || "https://www.instagram.com/mayra_.jewels/";
  return (
    <div style={{ background: "var(--surface)", padding: "48px 20px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2
            style={{
              fontFamily: "var(--font-caps)",
              fontSize: 13,
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              margin: 0,
              color: "var(--ink)",
            }}
          >
            @mayra_.jewels
          </h2>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: "var(--font-caps)",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              border: "1px solid var(--gold-500)",
              color: "var(--gold-700)",
              padding: "8px 16px",
              borderRadius: 999,
            }}
          >
            Follow
          </a>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
          }}
          className="insta-grid"
        >
          {TILES.map((src, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mrow"
              style={{ position: "relative", aspectRatio: "1 / 1", overflow: "hidden", display: "block", borderRadius: 4 }}
            >
              <Image src={src} alt="Mayra jewellery on Instagram" fill sizes="200px" className="mimg" style={{ objectFit: "cover" }} />
            </a>
          ))}
        </div>
      </div>
      <style>{`
        @media (min-width: 768px) {
          .insta-grid { grid-template-columns: repeat(6, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
