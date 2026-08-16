"use client";

// The dangerous tab — plans/05-admin-panel.md §5.3. variant_key is built
// positionally from options, so changing the option set invalidates every
// existing variant key. This always previews the consequence before
// committing (confirm=false first, confirm=true only after the admin
// explicitly accepts what will be lost).
import { useState } from "react";
import { adminReplaceOptions, type OptionInput, type OptionsReplacePreview } from "@/lib/admin-api";
import type { AdminOption } from "@/lib/admin-types";

function toInput(opts: AdminOption[]): OptionInput[] {
  return opts.map((o) => ({
    key: o.key,
    label: o.label,
    type: o.type,
    position: o.position,
    values: o.values.map((v) => ({ valueId: v.valueId, label: v.label, hex: v.hex, priceDelta: v.priceDelta, position: v.position })),
  }));
}

export default function OptionsEditor({ productId, options, onChange }: { productId: string; options: AdminOption[]; onChange: () => void }) {
  const [draft, setDraft] = useState<OptionInput[]>(() => toInput(options));
  const [preview, setPreview] = useState<OptionsReplacePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateOption(i: number, patch: Partial<OptionInput>) {
    setDraft((d) => d.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
    setPreview(null);
  }
  function updateValue(oi: number, vi: number, patch: Partial<OptionInput["values"][number]>) {
    setDraft((d) =>
      d.map((o, idx) => (idx !== oi ? o : { ...o, values: o.values.map((v, j) => (j === vi ? { ...v, ...patch } : v)) })),
    );
    setPreview(null);
  }
  function addOption() {
    setDraft((d) => [...d, { key: "", label: "", type: "swatch", position: d.length, values: [] }]);
  }
  function removeOption(i: number) {
    setDraft((d) => d.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, position: idx })));
    setPreview(null);
  }
  function addValue(oi: number) {
    setDraft((d) => d.map((o, idx) => (idx !== oi ? o : { ...o, values: [...o.values, { valueId: "", label: "", position: o.values.length }] })));
  }
  function removeValue(oi: number, vi: number) {
    setDraft((d) => d.map((o, idx) => (idx !== oi ? o : { ...o, values: o.values.filter((_, j) => j !== vi) })));
    setPreview(null);
  }

  async function doPreview() {
    setError(null);
    setBusy(true);
    try {
      const res = await adminReplaceOptions(productId, draft, false);
      if ("preview" in res) setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview changes.");
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    setBusy(true);
    setError(null);
    try {
      await adminReplaceOptions(productId, draft, true);
      setPreview(null);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save options.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {draft.map((opt, oi) => (
        <div key={oi} style={{ border: "1px solid #e2e4e9", borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input placeholder="key (colour)" value={opt.key} onChange={(e) => updateOption(oi, { key: e.target.value })} style={smallInput} />
            <input placeholder="Label" value={opt.label} onChange={(e) => updateOption(oi, { label: e.target.value })} style={smallInput} />
            <select value={opt.type} onChange={(e) => updateOption(oi, { type: e.target.value as "swatch" | "segment" })} style={smallInput}>
              <option value="swatch">swatch</option>
              <option value="segment">segment</option>
            </select>
            <button onClick={() => removeOption(oi)} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 12 }}>
              Remove option
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {opt.values.map((v, vi) => (
              <div key={vi} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input placeholder="id (gold)" value={v.valueId} onChange={(e) => updateValue(oi, vi, { valueId: e.target.value })} style={tinyInput} />
                <input placeholder="Label" value={v.label} onChange={(e) => updateValue(oi, vi, { label: e.target.value })} style={tinyInput} />
                {opt.type === "swatch" && (
                  <input placeholder="#hex" value={v.hex ?? ""} onChange={(e) => updateValue(oi, vi, { hex: e.target.value })} style={tinyInput} />
                )}
                <input
                  type="number"
                  placeholder="+Rs"
                  value={v.priceDelta ?? 0}
                  onChange={(e) => updateValue(oi, vi, { priceDelta: Number(e.target.value) || 0 })}
                  style={{ ...tinyInput, width: 70 }}
                />
                <button onClick={() => removeValue(oi, vi)} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 12 }}>
                  ✕
                </button>
              </div>
            ))}
            <button onClick={() => addValue(oi)} style={{ alignSelf: "flex-start", background: "none", border: "1px dashed #d0d3d9", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
              + value
            </button>
          </div>
        </div>
      ))}
      <button onClick={addOption} style={{ background: "none", border: "1px dashed #d0d3d9", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer", marginBottom: 14 }}>
        + Add option
      </button>

      {preview && (
        <div style={{ background: "#fff8e6", border: "1px solid #f0d999", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
          <p style={{ margin: "0 0 6px" }}>{preview.note}</p>
          {preview.lostVariants.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {preview.lostVariants.map((v) => (
                <li key={v.variantKey}>
                  {v.variantKey} ({v.sku}) — {v.stock} in stock
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p style={{ color: "#c0392b", fontSize: 12, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={doPreview} disabled={busy} style={{ background: "#fff", border: "1px solid #d0d3d9", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
          Preview changes
        </button>
        {preview && (
          <button onClick={doConfirm} disabled={busy} style={{ background: "#c0392b", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
            Confirm & apply
          </button>
        )}
      </div>
    </div>
  );
}

const smallInput: React.CSSProperties = { padding: "7px 9px", borderRadius: 4, border: "1px solid #d0d3d9", fontSize: 13, width: 130 };
const tinyInput: React.CSSProperties = { padding: "6px 8px", borderRadius: 4, border: "1px solid #d0d3d9", fontSize: 12, width: 100 };
