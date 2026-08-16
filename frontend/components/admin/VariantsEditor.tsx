"use client";

// The most-used admin screen (plans/05-admin-panel.md §5.4). "Remove" means
// "we never made this" (-> hatched on the storefront), NOT "sold out"
// (-> set stock to 0 instead). The two must not be confused.
import { useState } from "react";
import { adminAddVariant, adminDeleteVariant, adminUpdateVariant } from "@/lib/admin-api";
import type { AdminVariant } from "@/lib/admin-types";

export default function VariantsEditor({ productId, variants, onChange }: { productId: string; variants: AdminVariant[]; onChange: () => void }) {
  const [newKey, setNewKey] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newStock, setNewStock] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function saveStock(v: AdminVariant, stock: number) {
    setSavingId(v.id);
    try {
      await adminUpdateVariant(v.id, { stock });
      onChange();
    } catch {
      // ignore — value reverts on next refresh
    } finally {
      setSavingId(null);
    }
  }

  async function remove(v: AdminVariant) {
    if (!confirm(`Remove combination "${v.variantKey}"? This means "never made" — the storefront will show it as hatched, not sold out. Setting stock to 0 is the sold-out state instead.`)) return;
    await adminDeleteVariant(v.id);
    onChange();
  }

  async function add() {
    setError(null);
    if (!newKey.trim() || !newSku.trim()) {
      setError("Combination key and SKU are required.");
      return;
    }
    try {
      await adminAddVariant(productId, newKey.trim(), newSku.trim(), Number(newStock) || 0);
      setNewKey("");
      setNewSku("");
      setNewStock("0");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add combination.");
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: "#8a8f99", marginBottom: 10 }}>
        Stock 0 = sold out (struck through on the site). Removing a row = never made (hatched). These are different states.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#8a8f99" }}>
            <th style={{ padding: "6px 8px" }}>Combination</th>
            <th style={{ padding: "6px 8px" }}>SKU</th>
            <th style={{ padding: "6px 8px" }}>Stock</th>
            <th style={{ padding: "6px 8px" }} />
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id} style={{ borderTop: "1px solid #eef0f3" }}>
              <td style={{ padding: "6px 8px" }}>{v.variantKey}</td>
              <td style={{ padding: "6px 8px" }}>{v.sku}</td>
              <td style={{ padding: "6px 8px" }}>
                <input
                  type="number"
                  min={0}
                  defaultValue={v.stock}
                  onBlur={(e) => {
                    const n = Math.max(0, Number(e.target.value) || 0);
                    if (n !== v.stock) saveStock(v, n);
                  }}
                  disabled={savingId === v.id}
                  style={{ width: 70, padding: "5px 7px", borderRadius: 4, border: v.stock === 0 ? "1px solid #e8b4ae" : "1px solid #d0d3d9" }}
                />
              </td>
              <td style={{ padding: "6px 8px" }}>
                <button onClick={() => remove(v)} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 12 }}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#8a8f99" }}>Combination key</label>
          <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="gold|18" style={{ padding: "7px 9px", borderRadius: 4, border: "1px solid #d0d3d9", fontSize: 13, width: 130 }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#8a8f99" }}>SKU</label>
          <input value={newSku} onChange={(e) => setNewSku(e.target.value)} placeholder="MYR-XX-01" style={{ padding: "7px 9px", borderRadius: 4, border: "1px solid #d0d3d9", fontSize: 13, width: 130 }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#8a8f99" }}>Stock</label>
          <input type="number" min={0} value={newStock} onChange={(e) => setNewStock(e.target.value)} style={{ padding: "7px 9px", borderRadius: 4, border: "1px solid #d0d3d9", fontSize: 13, width: 70 }} />
        </div>
        <button onClick={add} style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
          Add combination
        </button>
      </div>
      {error && <p style={{ color: "#c0392b", fontSize: 12, marginTop: 8 }}>{error}</p>}
      <p style={{ fontSize: 11, color: "#8a8f99", marginTop: 8 }}>
        Key format matches the product&rsquo;s option order joined by &lsquo;|&rsquo; (e.g. colour|length -&gt;
        &lsquo;gold|18&rsquo;), or &lsquo;default&rsquo; for a product with no options.
      </p>
    </div>
  );
}
