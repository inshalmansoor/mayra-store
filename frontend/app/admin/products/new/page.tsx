"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminAddVariant,
  adminAiCollections,
  adminAiContinueDraft,
  adminAiStartDraft,
  adminAiStatus,
  adminCreateProduct,
  adminReplaceOptions,
  adminUploadImage,
} from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import type { AiOptionValue, AiProductDraft, AiQuestion, AiSuggestion, AiTurnResult } from "@/lib/ai-types";
import { EMPTY_AI_DRAFT } from "@/lib/ai-types";

const CATEGORIES = ["necklaces", "bracelets", "rings", "earrings"];
const MATERIALS = ["18k gold-plated stainless steel"];

// The free-tier model this runs on has been measured taking 20-50s+ per
// turn — static "Thinking…" text reads as broken over a wait that long.
// A live counter is the difference between "is this stuck?" and "it's
// working, just slow."
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}

// Position-order join by '|', or the literal 'default' with no options — the
// SAME rule as variantKey() in lib/variants.ts. The AI agent never computes
// this itself (plans/09 §6); this is the one place the join happens for a
// brand-new product, mirroring that rule exactly.
function joinVariantKey(values: string[]): string {
  return values.length ? values.join("|") : "default";
}

export default function NewProductPage() {
  const router = useRouter();
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"choose" | "ai" | "manual">("choose");

  useEffect(() => {
    adminAiStatus()
      .then((s) => setAiAvailable(s.enabled))
      .catch(() => setAiAvailable(false));
  }, []);

  if (mode === "manual") return <ManualForm onBack={aiAvailable ? () => setMode("choose") : undefined} />;
  if (mode === "ai") return <AiAssistFlow onBack={() => setMode("choose")} />;

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>New product</h1>
      {aiAvailable === null ? null : aiAvailable ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ChoiceCard
            title="Describe it — AI drafts the rest"
            body="Upload a photo and a sentence. The assistant proposes the name, copy, and structure, asks you about price, stock, and material directly, and shows you a complete draft to review before anything saves."
            action="Start with AI"
            onClick={() => setMode("ai")}
          />
          <ChoiceCard title="Fill in the form myself" body="The plain manual form, unchanged." action="Fill in manually" onClick={() => setMode("manual")} />
        </div>
      ) : (
        <ManualForm />
      )}
    </div>
  );
}

function ChoiceCard({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }) {
  return (
    <div style={{ border: "1px solid #e2e4e9", borderRadius: 8, padding: 18, background: "#fff" }}>
      <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>{title}</h2>
      <p style={{ fontSize: 13, color: "#565a63", margin: "0 0 12px" }}>{body}</p>
      <button onClick={onClick} style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
        {action}
      </button>
    </div>
  );
}

// ============================================================== AI assist
type ChatEntry = { role: "agent" | "owner"; text: string };

function AiAssistFlow({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [visualFacts, setVisualFacts] = useState("");
  const [draft, setDraft] = useState<AiProductDraft>(EMPTY_AI_DRAFT);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [autoDecided, setAutoDecided] = useState<string[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<AiQuestion[]>([]);
  const [turnCount, setTurnCount] = useState(1);
  const [done, setDone] = useState(false);
  const [reply, setReply] = useState("");
  const [thinking, setThinking] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const started = chat.length > 0;
  const startingSeconds = useElapsedSeconds(starting);
  const thinkingSeconds = useElapsedSeconds(thinking);

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function applyTurn(out: AiTurnResult) {
    setVisualFacts(out.visualFacts);
    setDraft(out.draft);
    setSuggestions(out.suggestions);
    setAutoDecided(out.autoDecided);
    setPendingQuestions(out.questions);
    setDone(out.done);
    setChat((c) => [...c, { role: "agent", text: out.message }]);
  }

  async function start() {
    if (!file) {
      setStartError("Add a photo first.");
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      setChat([{ role: "owner", text: description.trim() || "(no description given)" }]);
      const out = await adminAiStartDraft(file, description.trim());
      applyTurn(out);
    } catch (err) {
      setChat([]);
      setStartError(err instanceof ApiError ? err.message2 : "Could not reach the AI. Try again, or fill in the form manually.");
    } finally {
      setStarting(false);
    }
  }

  async function sendReply() {
    if (!reply.trim() || thinking) return;
    setThinking(true);
    setTurnError(null);
    const answer = reply.trim();
    setChat((c) => [...c, { role: "owner", text: answer }]);
    setReply("");
    try {
      const out = await adminAiContinueDraft({
        visualFacts,
        draft,
        pendingQuestions,
        answer,
        turnCount,
      });
      setTurnCount((n) => n + 1);
      applyTurn(out);
    } catch (err) {
      setTurnError(err instanceof ApiError ? err.message2 : "The AI didn't respond — you can keep answering, or edit the draft directly and save.");
    } finally {
      setThinking(false);
    }
  }

  const blockingUnanswered = pendingQuestions.some((q) => q.blocking);
  const canSave = started && !blockingUnanswered && draft.name && draft.category && draft.basePrice != null && draft.material;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const product = await adminCreateProduct({
        slug: (draft.slug || "").trim(),
        name: (draft.name || "").trim(),
        category: draft.category!,
        collection: draft.collection || null,
        basePrice: draft.basePrice!,
        material: draft.material!,
        blurb: draft.blurb || "",
        care: draft.care,
      });

      if (draft.options.length > 0) {
        await adminReplaceOptions(
          product.id,
          draft.options.map((o, i) => ({
            key: o.key,
            label: o.label,
            type: "swatch" as const,
            position: i,
            values: o.values.map((v: AiOptionValue, vi: number) => ({ valueId: v.valueId, label: v.label, position: vi })),
          })),
          true,
        );
      }

      const plan = draft.variantPlan.length > 0 ? draft.variantPlan : [{ values: [], state: "made" as const, stock: 1, sku: draft.sku }];
      let n = 1;
      for (const entry of plan) {
        if (entry.state === "not_made") continue; // no row at all — "never made", per plans/09 §6
        const sku = entry.sku || draft.sku || `MYR-NEW-${String(n).padStart(2, "0")}`;
        n += 1;
        await adminAddVariant(product.id, joinVariantKey(entry.values), sku, entry.stock ?? 0);
      }

      if (file) {
        await adminUploadImage(product.id, file, "default", draft.alt || "");
      }

      router.push(`/admin/products/${product.id}`);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message2 : "Could not save this product.");
    } finally {
      setSaving(false);
    }
  }

  if (!started) {
    return (
      <div style={{ maxWidth: 480 }}>
        <BackLink onClick={onBack} />
        <h1 style={{ fontSize: 22, marginBottom: 16 }}>Describe the new piece</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#565a63", marginBottom: 6 }}>Photo</label>
            {preview ? (
              <div style={{ position: "relative", width: 160, height: 160, borderRadius: 8, overflow: "hidden", marginBottom: 8, background: "#f4f5f7" }}>
                {/* preview only — never uploaded until Save */}
                <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ) : null}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#565a63", marginBottom: 4 }}>Description (optional but helps)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="new gold ring, hammered texture, comes in a few sizes"
              style={{ width: "100%", padding: "9px 11px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 14 }}
            />
          </div>
          {startError && <p style={{ color: "#c0392b", fontSize: 13 }}>{startError}</p>}
          <button
            onClick={start}
            disabled={starting || !file}
            style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "10px 16px", fontSize: 14, cursor: starting ? "wait" : "pointer" }}
          >
            {starting ? `Looking at the photo… (${startingSeconds}s)` : "Start"}
          </button>
          {starting && (
            <p style={{ fontSize: 12, color: "#8a8f99" }}>
              This can take up to a minute — the free-tier AI is slow right now. It is working; no need to retry.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
      {/* Chat pane */}
      <div>
        <BackLink onClick={onBack} />
        <div style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, padding: 16, marginBottom: 12, maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {preview && (
            <div style={{ position: "relative", width: 72, height: 72, borderRadius: 6, overflow: "hidden", marginBottom: 4, background: "#f4f5f7" }}>
              <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          {chat.map((entry, i) => (
            <div key={i} style={{ alignSelf: entry.role === "owner" ? "flex-end" : "flex-start", maxWidth: "90%" }}>
              <div style={{ fontSize: 10, color: "#8a8f99", marginBottom: 2, textAlign: entry.role === "owner" ? "right" : "left" }}>
                {entry.role === "owner" ? "You" : "AI"}
              </div>
              <div style={{ background: entry.role === "owner" ? "#eceef2" : "#f4f5f7", borderRadius: 8, padding: "8px 12px", fontSize: 13, whiteSpace: "pre-wrap" }}>
                {entry.text}
              </div>
            </div>
          ))}
          {thinking && (
            <div style={{ fontSize: 12, color: "#8a8f99" }}>
              Thinking… ({thinkingSeconds}s) — can take up to a minute on the free tier, it hasn&rsquo;t stalled.
            </div>
          )}
        </div>

        {pendingQuestions.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {pendingQuestions.map((q) => (
              <div key={q.id} style={{ fontSize: 12, color: q.blocking ? "#8a2c1a" : "#565a63", marginBottom: 2 }}>
                {q.blocking ? "● " : "○ "}
                {q.text}
              </div>
            ))}
          </div>
        )}

        {!done && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendReply()}
              disabled={thinking}
              placeholder="Answer, or say “you decide”…"
              style={{ flex: 1, padding: "9px 11px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 14, opacity: thinking ? 0.6 : 1 }}
            />
            <button onClick={sendReply} disabled={thinking || !reply.trim()} style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: thinking ? "wait" : "pointer" }}>
              {thinking ? `Thinking… (${thinkingSeconds}s)` : "Send"}
            </button>
          </div>
        )}
        {turnError && <p style={{ color: "#c0392b", fontSize: 12, marginTop: 8 }}>{turnError}</p>}
        {done && <p style={{ color: "#2d7a3a", fontSize: 13, marginTop: 8 }}>Draft ready — review it and save →</p>}
      </div>

      {/* Live draft form */}
      <div>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>Draft</h2>
        <div style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <DraftField label="Name" value={draft.name} suggestion={suggestions.find((s) => s.field === "name")} auto={autoDecided.includes("name")} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
          <DraftField label="Slug (permanent)" value={draft.slug} suggestion={suggestions.find((s) => s.field === "slug")} auto={autoDecided.includes("slug")} onChange={(v) => setDraft((d) => ({ ...d, slug: v }))} />
          <div>
            <FieldLabel label="Category" suggestion={suggestions.find((s) => s.field === "category")} auto={autoDecided.includes("category")} />
            <select value={draft.category ?? ""} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value || null }))} style={selectStyle}>
              <option value="">—</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel label="Collection" suggestion={suggestions.find((s) => s.field === "collection")} auto={autoDecided.includes("collection")} />
            <CollectionPicker value={draft.collection} onChange={(v) => setDraft((d) => ({ ...d, collection: v }))} />
          </div>
          <div>
            <FieldLabel label="Base price (Rs)" required />
            <input
              type="number"
              value={draft.basePrice ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, basePrice: e.target.value === "" ? null : Number(e.target.value) }))}
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel label="Material" required />
            <MaterialPicker value={draft.material} onChange={(v) => setDraft((d) => ({ ...d, material: v }))} />
          </div>
          <DraftField label="Blurb" value={draft.blurb} suggestion={suggestions.find((s) => s.field === "blurb")} auto={autoDecided.includes("blurb")} onChange={(v) => setDraft((d) => ({ ...d, blurb: v }))} textarea />
          <div>
            <FieldLabel label="Care" suggestion={suggestions.find((s) => s.field === "care")} auto={autoDecided.includes("care")} />
            <p style={{ fontSize: 13, margin: 0 }}>{draft.care.join(" · ") || "—"}</p>
          </div>
          <DraftField label="SKU" value={draft.sku} suggestion={suggestions.find((s) => s.field === "sku")} auto={autoDecided.includes("sku")} onChange={(v) => setDraft((d) => ({ ...d, sku: v }))} />
          <DraftField label="Alt text" value={draft.alt} suggestion={suggestions.find((s) => s.field === "alt")} auto={autoDecided.includes("alt")} onChange={(v) => setDraft((d) => ({ ...d, alt: v }))} />

          {draft.options.length > 0 && (
            <div>
              <FieldLabel label="Options & stock" auto={autoDecided.includes("options")} />
              <VariantPlanEditor draft={draft} setDraft={setDraft} />
            </div>
          )}
          {draft.options.length === 0 && (
            <div>
              <FieldLabel label="Stock" required />
              <input
                type="number"
                min={0}
                value={draft.variantPlan[0]?.stock ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    variantPlan: [{ values: [], state: "made", stock: Number(e.target.value) || 0, sku: d.sku }],
                  }))
                }
                style={inputStyle}
              />
            </div>
          )}

          {saveError && <p style={{ color: "#c0392b", fontSize: 13 }}>{saveError}</p>}
          <button
            onClick={save}
            disabled={!canSave || saving}
            title={!canSave ? "Answer price, stock and material before saving" : undefined}
            style={{
              background: canSave ? "#1a1a1a" : "#d0d3d9",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "10px 16px",
              fontSize: 14,
              cursor: canSave && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving…" : "Create product"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VariantPlanEditor({ draft, setDraft }: { draft: AiProductDraft; setDraft: (fn: (d: AiProductDraft) => AiProductDraft) => void }) {
  function update(i: number, patch: Partial<AiProductDraft["variantPlan"][number]>) {
    setDraft((d) => ({
      ...d,
      variantPlan: d.variantPlan.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    }));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {draft.variantPlan.map((entry, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ minWidth: 100 }}>{entry.values.join(" · ") || "default"}</span>
          <select value={entry.state} onChange={(e) => update(i, { state: e.target.value as "made" | "not_made" })} style={{ ...selectStyle, width: 110, padding: "5px 6px" }}>
            <option value="made">Made</option>
            <option value="not_made">Not made</option>
          </select>
          {entry.state === "made" && (
            <input
              type="number"
              min={0}
              value={entry.stock}
              onChange={(e) => update(i, { stock: Number(e.target.value) || 0 })}
              placeholder="stock"
              style={{ width: 70, padding: "5px 6px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 12 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function CollectionPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [options, setOptions] = useState<string[]>([]);
  useEffect(() => {
    adminAiCollections().then(setOptions).catch(() => setOptions([]));
  }, []);
  const [custom, setCustom] = useState(false);
  if (custom || (value && !options.includes(value))) {
    return (
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="new collection name"
        style={inputStyle}
      />
    );
  }
  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setCustom(true);
          onChange("");
        } else {
          onChange(e.target.value || null);
        }
      }}
      style={selectStyle}
    >
      <option value="">None</option>
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__new__">+ New collection…</option>
    </select>
  );
}

function MaterialPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [custom, setCustom] = useState(!!value && !MATERIALS.includes(value));
  if (custom) {
    return <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
  }
  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "__other__") {
          setCustom(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      style={selectStyle}
    >
      <option value="">—</option>
      {MATERIALS.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
      <option value="__other__">Other…</option>
    </select>
  );
}

function DraftField({
  label,
  value,
  onChange,
  suggestion,
  auto,
  textarea,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  suggestion?: AiSuggestion;
  auto?: boolean;
  textarea?: boolean;
}) {
  return (
    <div>
      <FieldLabel label={label} suggestion={suggestion} auto={auto} />
      {textarea ? (
        <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} style={inputStyle} />
      ) : (
        <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  );
}

function FieldLabel({ label, suggestion, auto, required }: { label: string; suggestion?: AiSuggestion; auto?: boolean; required?: boolean }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <label style={{ fontSize: 12, color: "#565a63" }}>
        {label} {required && <span style={{ color: "#8a2c1a" }}>*</span>}
        {auto && (
          <span style={{ marginLeft: 6, fontSize: 10, background: "#eceef2", color: "#565a63", borderRadius: 999, padding: "1px 7px" }}>auto</span>
        )}
      </label>
      {suggestion && <p style={{ fontSize: 11, color: "#8a8f99", margin: "2px 0 0" }}>{suggestion.reason}</p>}
    </div>
  );
}

function BackLink({ onClick }: { onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", color: "#565a63", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 10 }}>
      ← Back
    </button>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 14 };
const selectStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 14 };

// ============================================================== Manual form
function ManualForm({ onBack }: { onBack?: () => void }) {
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
      <BackLink onClick={onBack} />
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

function AField({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#565a63", marginBottom: 4 }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}
