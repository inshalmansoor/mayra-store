"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminCreateProduct } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";

const CATEGORIES = ["necklaces", "bracelets", "rings", "earrings"];

export default function NewProductPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("necklaces");
  const [basePrice, setBasePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!slug.trim() || !name.trim() || !basePrice) {
      setError("Slug, name and price are required.");
      return;
    }
    setSubmitting(true);
    try {
      const product = await adminCreateProduct({
        slug: slug.trim(),
        name: name.trim(),
        category,
        basePrice: Number(basePrice),
        material: "18k gold-plated stainless steel",
        care: ["Remove before showering or swimming", "Keep away from perfume and lotion", "Store dry, in the pouch it arrives in"],
      });
      router.push(`/admin/products/${product.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message2 : "Could not create product.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>New product</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <AField label="Slug (URL id, permanent)" value={slug} onChange={setSlug} placeholder="p-new-piece" />
        <AField label="Name" value={name} onChange={setName} placeholder="New Piece Necklace" />
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#565a63", marginBottom: 4 }}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <AField label="Base price (Rs)" value={basePrice} onChange={setBasePrice} type="number" placeholder="2400" />
        {error && <p style={{ color: "#c0392b", fontSize: 13 }}>{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "10px 16px", fontSize: 14, cursor: submitting ? "wait" : "pointer" }}
        >
          {submitting ? "Creating…" : "Create product"}
        </button>
      </form>
      <p style={{ fontSize: 12, color: "#8a8f99", marginTop: 14 }}>
        Add options, images and stock on the next screen — a brand-new product has no variants until you add at least
        one combination.
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 14 };

function AField({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#565a63", marginBottom: 4 }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}
