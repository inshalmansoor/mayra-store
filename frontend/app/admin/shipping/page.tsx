"use client";

// Full admin control over shipping — plans/09 §15-22. Three owner switches
// (master multi-rate on/off, free-shipping-all, free-over-threshold) live in
// the generic key/value Setting table; the rate list is its own table since
// each rate has real fields and ordering, not just a scalar value.
import { useEffect, useState } from "react";
import {
  adminCreateShippingRate,
  adminDeactivateShippingRate,
  adminGetSettings,
  adminListShippingRates,
  adminUpdateSetting,
  adminUpdateShippingRate,
  type ShippingRateInput,
} from "@/lib/admin-api";
import type { AdminShippingRate } from "@/lib/admin-types";
import { resolveDeliveryFee, resolveShippingRate } from "@/lib/pricing";
import { fmt } from "@/lib/format";
import { ApiError } from "@/lib/api";

const PREVIEW_SUBTOTALS = [1500, 6000];

export default function AdminShippingPage() {
  const [rates, setRates] = useState<AdminShippingRate[]>([]);
  const [multiEnabled, setMultiEnabled] = useState(false);
  const [freeAll, setFreeAll] = useState(false);
  const [freeThreshold, setFreeThreshold] = useState("0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newRate, setNewRate] = useState({ label: "", deliveryEstimate: "", fee: "" });
  const [adding, setAdding] = useState(false);

  async function load() {
    const [rateList, settingsMap] = await Promise.all([adminListShippingRates(), adminGetSettings()]);
    setRates(rateList);
    setMultiEnabled(settingsMap.shipping_multiple_rates_enabled === "true");
    setFreeAll(settingsMap.shipping_free_all === "true");
    setFreeThreshold(settingsMap.shipping_free_threshold ?? "0");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveSwitch(key: string, value: string) {
    setError(null);
    try {
      await adminUpdateSetting(key, value);
    } catch (err) {
      setError(err instanceof ApiError ? err.message2 : "Could not save.");
    }
  }

  async function toggleMulti(next: boolean) {
    setMultiEnabled(next);
    await saveSwitch("shipping_multiple_rates_enabled", next ? "true" : "false");
  }

  async function toggleFreeAll(next: boolean) {
    setFreeAll(next);
    await saveSwitch("shipping_free_all", next ? "true" : "false");
  }

  async function saveThreshold() {
    await saveSwitch("shipping_free_threshold", String(Math.max(0, Number(freeThreshold) || 0)));
  }

  async function addRate() {
    if (!newRate.label.trim() || newRate.fee === "") return;
    setAdding(true);
    setError(null);
    try {
      const payload: ShippingRateInput = {
        label: newRate.label.trim(),
        deliveryEstimate: newRate.deliveryEstimate.trim(),
        fee: Number(newRate.fee),
        sortOrder: rates.length,
      };
      await adminCreateShippingRate(payload);
      setNewRate({ label: "", deliveryEstimate: "", fee: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message2 : "Could not add that rate.");
    } finally {
      setAdding(false);
    }
  }

  async function patchRate(id: string, payload: Partial<ShippingRateInput & { isActive: boolean }>) {
    setError(null);
    try {
      await adminUpdateShippingRate(id, payload);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message2 : "Could not update that rate.");
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this shipping rate? Past orders that used it are unaffected.")) return;
    setError(null);
    try {
      await adminDeactivateShippingRate(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message2 : "Could not deactivate that rate.");
    }
  }

  if (loading) return null;

  const activeRates = rates.filter((r) => r.isActive);

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Shipping</h1>
      <p style={{ fontSize: 13, color: "#8a8f99", marginBottom: 20 }}>
        You decide everything here: whether customers see one rate or several, whether shipping is ever free, and
        the price and delivery estimate of every tier.
      </p>

      {error && (
        <div style={{ background: "#fdecea", color: "#8a2c1a", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Master switch */}
      <Card>
        <SwitchRow
          label="Let customers choose between multiple shipping rates"
          checked={multiEnabled}
          onChange={toggleMulti}
        />
        <p style={{ fontSize: 12, color: "#8a8f99", margin: "4px 0 0" }}>
          {multiEnabled
            ? "Checkout shows a rate selector. The rate marked “Default” below is pre-selected."
            : "Checkout shows no choice — every order is charged the rate marked “Default” below, no matter how many other rates you keep in the list."}
        </p>
      </Card>

      {/* Free shipping switches */}
      <Card>
        <SwitchRow label="Free shipping for everyone" checked={freeAll} onChange={toggleFreeAll} />
        <div style={{ marginTop: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#565a63", marginBottom: 4 }}>
            Free shipping on orders over (Rs) — 0 disables this
          </label>
          <input
            type="number"
            min={0}
            value={freeThreshold}
            onChange={(e) => setFreeThreshold(e.target.value)}
            onBlur={saveThreshold}
            style={{ width: 160, padding: "8px 10px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 13 }}
          />
        </div>
        <p style={{ fontSize: 12, color: "#8a8f99", margin: "10px 0 0" }}>
          Either switch only zeroes a rate that has &ldquo;Eligible for free shipping&rdquo; checked below — a rate
          left unchecked (e.g. Express) always charges its fee, even with free shipping on.
        </p>
      </Card>

      {/* Rates table */}
      <Card>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Rates</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rates.map((r) => (
            <RateRow key={r.id} rate={r} onPatch={(p) => patchRate(r.id, p)} onDeactivate={() => deactivate(r.id)} />
          ))}
          {rates.length === 0 && <p style={{ fontSize: 13, color: "#8a8f99" }}>No rates yet — add one below.</p>}
        </div>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #eceef2", display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Label" value={newRate.label} onChange={(v) => setNewRate((s) => ({ ...s, label: v }))} placeholder="Express" width={140} />
          <Field label="Delivery estimate" value={newRate.deliveryEstimate} onChange={(v) => setNewRate((s) => ({ ...s, deliveryEstimate: v }))} placeholder="next day" width={160} />
          <Field label="Fee (Rs)" value={newRate.fee} onChange={(v) => setNewRate((s) => ({ ...s, fee: v }))} placeholder="400" type="number" width={100} />
          <button
            onClick={addRate}
            disabled={adding || !newRate.label.trim() || newRate.fee === ""}
            style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: adding ? "wait" : "pointer", height: 36 }}
          >
            {adding ? "Adding…" : "Add rate"}
          </button>
        </div>
      </Card>

      {/* Worked preview */}
      {activeRates.length > 0 && (
        <Card>
          <h2 style={{ fontSize: 15, marginBottom: 4 }}>What customers would actually pay</h2>
          <p style={{ fontSize: 12, color: "#8a8f99", marginBottom: 12 }}>
            Computed live from the settings above — this is exactly what checkout will charge.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#8a8f99" }}>
                <th style={{ padding: "6px 8px" }}>Rate</th>
                {PREVIEW_SUBTOTALS.map((s) => (
                  <th key={s} style={{ padding: "6px 8px" }}>
                    Cart of {fmt(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(multiEnabled ? activeRates : activeRates.filter((r) => r.isDefault)).map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #eceef2" }}>
                  <td style={{ padding: "8px" }}>
                    {r.label}
                    {r.isDefault && <span style={{ color: "#8a8f99" }}> (default)</span>}
                  </td>
                  {PREVIEW_SUBTOTALS.map((s) => {
                    const fee = resolveDeliveryFee(r, s, s, { shippingFreeAll: freeAll, shippingFreeThreshold: Number(freeThreshold) || 0 });
                    return (
                      <td key={s} style={{ padding: "8px" }}>
                        {fee === 0 ? "Free" : fmt(fee)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, padding: 18, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontSize: 14 }}>{label}</span>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  width,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  width?: number;
}) {
  return (
    <div style={{ width }}>
      <label style={{ display: "block", fontSize: 11, color: "#8a8f99", marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 13 }}
      />
    </div>
  );
}

function RateRow({
  rate,
  onPatch,
  onDeactivate,
}: {
  rate: AdminShippingRate;
  onPatch: (p: Partial<ShippingRateInput & { isActive: boolean }>) => void;
  onDeactivate: () => void;
}) {
  const [label, setLabel] = useState(rate.label);
  const [estimate, setEstimate] = useState(rate.deliveryEstimate);
  const [fee, setFee] = useState(String(rate.fee));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        border: "1px solid #eceef2",
        borderRadius: 8,
        opacity: rate.isActive ? 1 : 0.5,
        flexWrap: "wrap",
      }}
    >
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== rate.label && onPatch({ label: label.trim() })}
        style={{ width: 120, padding: "6px 8px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 13 }}
      />
      <input
        value={estimate}
        onChange={(e) => setEstimate(e.target.value)}
        onBlur={() => estimate !== rate.deliveryEstimate && onPatch({ deliveryEstimate: estimate })}
        placeholder="delivery estimate"
        style={{ width: 140, padding: "6px 8px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 13 }}
      />
      <input
        type="number"
        min={0}
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        onBlur={() => Number(fee) !== rate.fee && onPatch({ fee: Math.max(0, Number(fee) || 0) })}
        style={{ width: 90, padding: "6px 8px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 13 }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
        <input type="checkbox" checked={rate.freeShippingEligible} onChange={(e) => onPatch({ freeShippingEligible: e.target.checked })} />
        Eligible for free shipping
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, marginLeft: "auto" }}>
        <input type="radio" name="defaultRate" checked={rate.isDefault} onChange={() => !rate.isDefault && onPatch({ isDefault: true })} />
        Default
      </label>
      {rate.isActive ? (
        <button onClick={onDeactivate} style={{ background: "none", border: "1px solid #d0d3d9", color: "#8a2c1a", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
          Deactivate
        </button>
      ) : (
        <button onClick={() => onPatch({ isActive: true })} style={{ background: "none", border: "1px solid #d0d3d9", color: "#2d7a3a", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
          Reactivate
        </button>
      )}
    </div>
  );
}
