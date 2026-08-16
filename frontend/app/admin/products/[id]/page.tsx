"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminDeactivateProduct, adminGetProduct, adminUpdateProduct } from "@/lib/admin-api";
import type { AdminProduct } from "@/lib/admin-types";
import { ApiError } from "@/lib/api";
import VariantsEditor from "@/components/admin/VariantsEditor";
import ImagesEditor from "@/components/admin/ImagesEditor";
import OptionsEditor from "@/components/admin/OptionsEditor";

const CATEGORIES = ["necklaces", "bracelets", "rings", "earrings"];

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function refresh() {
    adminGetProduct(params.id).then(setProduct);
  }

  useEffect(refresh, [params.id]);

  if (!product) return <p>Loading…</p>;

  async function saveDetails(patch: Partial<AdminProduct>) {
    setSavingDetails(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await adminUpdateProduct(product!.id, {
        name: patch.name ?? product!.name,
        category: patch.category ?? product!.category,
        collection: patch.collection !== undefined ? patch.collection : product!.collection,
        basePrice: patch.basePrice ?? product!.basePrice,
        material: patch.material ?? product!.material,
        blurb: patch.blurb ?? product!.blurb,
        care: patch.care ?? product!.care,
        isActive: patch.isActive ?? product!.isActive,
        isFeatured: patch.isFeatured ?? product!.isFeatured,
        sortOrder: patch.sortOrder ?? product!.sortOrder,
      });
      setProduct((p) => (p ? { ...p, ...updated } : p));
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message2 : "Could not save.");
    } finally {
      setSavingDetails(false);
    }
  }

  async function deactivate() {
    if (!confirm("Deactivate this product? It disappears from the storefront but past orders keep their own record of it.")) return;
    await adminDeactivateProduct(product!.id);
    router.push("/admin/products");
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{product.name}</h1>
        <button onClick={deactivate} style={{ background: "none", border: "1px solid #e8b4ae", color: "#c0392b", borderRadius: 6, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}>
          Deactivate
        </button>
      </div>

      <Section title="Details">
        <DetailsForm product={product} onSave={saveDetails} saving={savingDetails} />
        {saved && <p style={{ color: "#2d7a3a", fontSize: 12, marginTop: 8 }}>Saved.</p>}
        {error && <p style={{ color: "#c0392b", fontSize: 12, marginTop: 8 }}>{error}</p>}
      </Section>

      <Section title="Options">
        <OptionsEditor productId={product.id} options={product.options} onChange={refresh} />
      </Section>

      <Section title="Variants & stock">
        <VariantsEditor productId={product.id} variants={product.variants} onChange={refresh} />
      </Section>

      <Section title="Images">
        <ImagesEditor productId={product.id} images={product.images} onChange={refresh} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, padding: 18, marginBottom: 18 }}>
      <h2 style={{ fontSize: 15, margin: "0 0 14px" }}>{title}</h2>
      {children}
    </section>
  );
}

function DetailsForm({ product, onSave, saving }: { product: AdminProduct; onSave: (patch: Partial<AdminProduct>) => void; saving: boolean }) {
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [collection, setCollection] = useState(product.collection ?? "");
  const [basePrice, setBasePrice] = useState(String(product.basePrice));
  const [material, setMaterial] = useState(product.material);
  const [blurb, setBlurb] = useState(product.blurb);
  const [care, setCare] = useState(product.care.join("\n"));
  const [isFeatured, setIsFeatured] = useState(product.isFeatured);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Field label={`Slug (permanent): ${product.slug}`} />
      <LabeledInput label="Name" value={name} onChange={setName} />
      <div>
        <label style={labelStyle}>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <LabeledInput label="Collection (optional, e.g. golden-essence)" value={collection} onChange={setCollection} />
      <LabeledInput label="Base price (Rs)" value={basePrice} onChange={setBasePrice} type="number" />
      <LabeledInput label="Material" value={material} onChange={setMaterial} />
      <div>
        <label style={labelStyle}>Blurb</label>
        <textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={3} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Care instructions (one per line)</label>
        <textarea value={care} onChange={(e) => setCare(e.target.value)} rows={3} style={inputStyle} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
        Featured on landing page (exactly four across the whole catalogue)
      </label>
      <button
        onClick={() =>
          onSave({
            name,
            category,
            collection: collection || null,
            basePrice: Number(basePrice) || 0,
            material,
            blurb,
            care: care.split("\n").map((s) => s.trim()).filter(Boolean),
            isFeatured,
          })
        }
        disabled={saving}
        style={{ alignSelf: "flex-start", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "9px 18px", fontSize: 13, cursor: saving ? "wait" : "pointer" }}
      >
        {saving ? "Saving…" : "Save details"}
      </button>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#565a63", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 14, fontFamily: "inherit" };

function LabeledInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

function Field({ label }: { label: string }) {
  return <p style={{ fontSize: 12, color: "#8a8f99", margin: 0 }}>{label}</p>;
}
