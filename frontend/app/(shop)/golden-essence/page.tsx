import Image from "next/image";
import { getProducts } from "@/lib/products";
import GoldenEssenceClient from "./GoldenEssenceClient";

export const metadata = { title: "Golden Essence" };

export default async function GoldenEssencePage() {
  const products = await getProducts().catch(() => []);
  const stack = products.filter((p) => p.collection === "golden-essence");

  return (
    <div>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 10" }}>
        <Image src="/brand/golden-essence-poster.jpg" alt="Golden Essence — layered to perfection, made to shine" fill priority sizes="100vw" style={{ objectFit: "cover" }} />
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-caps)", fontSize: 14, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", margin: "0 0 14px" }}>
          Golden Essence
        </h1>
        <p style={{ fontFamily: "var(--font-script)", fontSize: "clamp(22px, 5vw, 30px)", color: "var(--forest-500)", margin: "0 0 20px" }}>
          Layered to perfection, made to shine
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 17, lineHeight: 1.7, color: "var(--ink)" }}>
          Layering is about building a stack that&rsquo;s entirely yours — a fine chain as the base, a rope or curb for weight,
          a herringbone for shine. Start with one piece and add as you go, or shop the whole stack in one place.
        </p>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 60px" }}>
        <GoldenEssenceClient products={stack} />
      </div>
    </div>
  );
}
