"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  adminAddVariant,
  adminAiEditProduct,
  adminAiRegenerateCopy,
  adminAiStatus,
  adminDeactivateProduct,
  adminDeleteProductPermanently,
  adminGetProduct,
  adminUpdateProduct,
  adminUpdateVariant,
} from "@/lib/admin-api";
import type { AdminProduct } from "@/lib/admin-types";
import type { AiEditChatMessage, AiEditProposal, AiSuggestion } from "@/lib/ai-types";
import { editProposalIsEmpty } from "@/lib/ai-types";
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
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    if (!confirm("Deactivate this product? It disappears from the storefront but past orders keep their own record of it. You can reactivate it any time by editing it and saving.")) return;
    await adminDeactivateProduct(product!.id);
    router.push("/admin/products");
  }

  async function deletePermanently() {
    const typed = prompt(
      `This permanently deletes “${product!.name}”, its photos, options and variants. This cannot be undone.\n\n` +
        `Past orders are unaffected — they keep their own copy of the name, price and photo.\n\n` +
        `Type the product's slug to confirm: ${product!.slug}`,
    );
    if (typed !== product!.slug) {
      if (typed !== null) alert("That didn't match the slug — nothing was deleted.");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await adminDeleteProductPermanently(product!.id);
      router.push("/admin/products");
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message2 : "Could not delete this product.");
      setDeleting(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{product.name}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {deleteError && <span style={{ color: "#c0392b", fontSize: 12 }}>{deleteError}</span>}
          <button onClick={deactivate} style={{ background: "none", border: "1px solid #e8b4ae", color: "#c0392b", borderRadius: 6, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}>
            Deactivate
          </button>
          <button
            onClick={deletePermanently}
            disabled={deleting}
            title="Permanently delete — cannot be undone"
            style={{ background: "#c0392b", border: "1px solid #c0392b", color: "#fff", borderRadius: 6, padding: "7px 14px", fontSize: 13, cursor: deleting ? "wait" : "pointer" }}
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>

      <Section title="AI edit assistant">
        <AiEditChat product={product} onApplied={refresh} />
      </Section>

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

function joinVariantKey(values: string[]): string {
  return values.length ? values.join("|") : "default";
}

function AiEditChat({ product, onApplied }: { product: AdminProduct; onApplied: () => void }) {
  const [aiAvailable, setAiAvailable] = useState(false);
  const [messages, setMessages] = useState<AiEditChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AiEditProposal | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    adminAiStatus().then((s) => setAiAvailable(s.enabled)).catch(() => setAiAvailable(false));
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setError(null);
    setApplyError(null);
    const history = messages;
    setMessages((m) => [...m, { role: "user", content: text }]);
    try {
      const out = await adminAiEditProduct(product.id, text, history);
      setMessages((m) => [...m, { role: "assistant", content: out.message }]);
      setProposal(editProposalIsEmpty(out.proposal) ? null : out.proposal);
    } catch (e) {
      setError(e instanceof ApiError ? e.message2 : "Could not reach the AI.");
    } finally {
      setSending(false);
    }
  }

  async function apply() {
    if (!proposal) return;
    setApplying(true);
    setApplyError(null);
    try {
      const patch = proposal.productPatch;
      const productUpdate: Record<string, unknown> = {};
      if (patch.name !== null) productUpdate.name = patch.name;
      if (patch.category !== null) productUpdate.category = patch.category;
      if (patch.collectionChanged) productUpdate.collection = patch.collection;
      if (patch.basePrice !== null) productUpdate.basePrice = patch.basePrice;
      if (patch.material !== null) productUpdate.material = patch.material;
      if (patch.blurb !== null) productUpdate.blurb = patch.blurb;
      if (patch.care !== null) productUpdate.care = patch.care;
      if (patch.isFeatured !== null) productUpdate.isFeatured = patch.isFeatured;
      if (patch.isActive !== null) productUpdate.isActive = patch.isActive;
      if (Object.keys(productUpdate).length > 0) {
        await adminUpdateProduct(product.id, productUpdate);
      }
      for (const vp of proposal.variantPatches) {
        const body: { stock?: number; sku?: string } = {};
        if (vp.stock !== null) body.stock = vp.stock;
        if (vp.sku !== null) body.sku = vp.sku;
        await adminUpdateVariant(vp.variantId, body);
      }
      for (const nv of proposal.newVariants) {
        await adminAddVariant(product.id, joinVariantKey(nv.values), nv.sku ?? "", nv.stock);
      }
      setProposal(null);
      setMessages((m) => [...m, { role: "assistant", content: "Applied." }]);
      onApplied();
    } catch (e) {
      setApplyError(e instanceof ApiError ? e.message2 : "Could not apply these changes — some may have partially gone through, check Details/Variants below.");
      onApplied();
    } finally {
      setApplying(false);
    }
  }

  if (!aiAvailable) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 11, color: "#8a8f99", margin: 0 }}>
        Tell it what to change — price, stock, material, category, collection, or add a variant combination the product already has as an option. Nothing is
        saved until you click Apply below. Photos aren&apos;t handled here — use the Images section.
      </p>
      {messages.length > 0 && (
        <div style={{ background: "#f4f5f7", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ fontSize: 13, alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
              <div
                style={{
                  background: m.role === "user" ? "#1a1a1a" : "#fff",
                  color: m.role === "user" ? "#fff" : "#1a1a1a",
                  border: m.role === "user" ? "none" : "1px solid #e2e4e9",
                  borderRadius: 8,
                  padding: "7px 10px",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {proposal && (
        <div style={{ background: "#fff8e6", border: "1px solid #eecf8a", borderRadius: 8, padding: 10 }}>
          <strong style={{ fontSize: 12 }}>Proposed changes</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
            {proposal.summary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={apply}
              disabled={applying}
              style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: applying ? "wait" : "pointer" }}
            >
              {applying ? "Applying…" : "Apply"}
            </button>
            <button
              onClick={() => setProposal(null)}
              disabled={applying}
              style={{ background: "#fff", border: "1px solid #d0d3d9", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
            >
              Dismiss
            </button>
          </div>
          {applyError && <p style={{ color: "#c0392b", fontSize: 12, marginTop: 6 }}>{applyError}</p>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="e.g. set the price to 1200, or mark gold size 7 as out of stock"
          style={{ ...inputStyle, flex: 1 }}
          disabled={sending}
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: sending ? "wait" : "pointer" }}
        >
          {sending ? "Thinking…" : "Send"}
        </button>
      </div>
      {error && <p style={{ color: "#c0392b", fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
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

  const [aiAvailable, setAiAvailable] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [copySuggestions, setCopySuggestions] = useState<AiSuggestion[]>([]);
  const [copyDraft, setCopyDraft] = useState<{ name: string | null; blurb: string | null; alt: string | null } | null>(null);

  useEffect(() => {
    adminAiStatus().then((s) => setAiAvailable(s.enabled)).catch(() => setAiAvailable(false));
  }, []);

  async function regenerateCopy() {
    setRegenerating(true);
    setRegenError(null);
    try {
      const out = await adminAiRegenerateCopy(product.id);
      setCopyDraft({ name: out.draft.name, blurb: out.draft.blurb, alt: out.draft.alt });
      setCopySuggestions(out.suggestions);
    } catch (e) {
      setRegenError(e instanceof ApiError ? e.message2 : "Could not reach the AI.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Field label={`Slug (permanent): ${product.slug}`} />

      {aiAvailable && (
        <div style={{ background: "#f4f5f7", borderRadius: 8, padding: 12 }}>
          <button
            onClick={regenerateCopy}
            disabled={regenerating}
            style={{ background: "#fff", border: "1px solid #d0d3d9", borderRadius: 6, padding: "7px 14px", fontSize: 12, cursor: regenerating ? "wait" : "pointer" }}
          >
            {regenerating ? "Thinking…" : "Regenerate copy with AI"}
          </button>
          <p style={{ fontSize: 11, color: "#8a8f99", margin: "6px 0 0" }}>
            Only touches name, blurb and image alt text — never price, stock, material, or structure.
          </p>
          {regenError && <p style={{ color: "#c0392b", fontSize: 12, marginTop: 6 }}>{regenError}</p>}
          {copyDraft && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {copyDraft.name && (
                <CopySuggestionRow
                  label="Name"
                  value={copyDraft.name}
                  reason={copySuggestions.find((s) => s.field === "name")?.reason}
                  onApply={() => setName(copyDraft.name!)}
                />
              )}
              {copyDraft.blurb && (
                <CopySuggestionRow
                  label="Blurb"
                  value={copyDraft.blurb}
                  reason={copySuggestions.find((s) => s.field === "blurb")?.reason}
                  onApply={() => setBlurb(copyDraft.blurb!)}
                />
              )}
              {copyDraft.alt && (
                <div style={{ fontSize: 12 }}>
                  <strong>Alt text suggestion</strong> (apply manually in Images below): {copyDraft.alt}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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

function CopySuggestionRow({ label, value, reason, onApply }: { label: string; value: string; reason?: string; onApply: () => void }) {
  return (
    <div style={{ fontSize: 12, background: "#fff", borderRadius: 6, padding: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <strong>{label}:</strong> {value}
          {reason && <div style={{ color: "#8a8f99", marginTop: 2 }}>{reason}</div>}
        </div>
        <button onClick={onApply} style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>
          Use this
        </button>
      </div>
    </div>
  );
}
