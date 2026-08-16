"use client";

import { useEffect, useState } from "react";
import { adminGetSettings, adminUpdateSetting } from "@/lib/admin-api";

const KEYS = [
  { key: "announcement_enabled", label: "Announcement bar enabled", bool: true },
  { key: "announcement_text", label: "Announcement text" },
  { key: "promo_popup_enabled", label: "Promo popup enabled", bool: true },
  { key: "about_intro", label: "About page intro (optional override)" },
];

export default function AdminSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    adminGetSettings().then(setValues);
  }, []);

  async function save(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    await adminUpdateSetting(key, value);
    setSaved(key);
    setTimeout(() => setSaved(null), 1500);
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>Settings</h1>
      <p style={{ fontSize: 13, color: "#8a8f99", marginBottom: 20 }}>
        Discount code, delivery fees, WhatsApp number and bank details live in the server&rsquo;s .env file, not here —
        they&rsquo;re rules the checkout enforces, not display text.
      </p>
      <div style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
        {KEYS.map((k) => (
          <div key={k.key}>
            <label style={{ display: "block", fontSize: 12, color: "#565a63", marginBottom: 4 }}>{k.label}</label>
            {k.bool ? (
              <select
                value={values[k.key] ?? "true"}
                onChange={(e) => save(k.key, e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 13 }}
              >
                <option value="true">On</option>
                <option value="false">Off</option>
              </select>
            ) : (
              <input
                value={values[k.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [k.key]: e.target.value }))}
                onBlur={(e) => save(k.key, e.target.value)}
                style={{ width: "100%", padding: "9px 11px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 14 }}
              />
            )}
            {saved === k.key && <span style={{ fontSize: 11, color: "#2d7a3a", marginLeft: 8 }}>Saved</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
