"use client";

// GET /api/admin/me is the auth probe: 200 -> render the panel, 401 -> show
// the login card. See plans/05-admin-panel.md §2. Error messaging is always
// "Incorrect password." — never a distinguishable "expired vs wrong" state.
import { useEffect, useState } from "react";
import { adminLogin, adminLogout, adminMe } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import AdminShell from "./AdminShell";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "authed" | "anon">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    adminMe()
      .then(() => setStatus("authed"))
      .catch(() => setStatus("anon"));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await adminLogin(password);
      setStatus("authed");
      setPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message2 : "Incorrect password.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await adminLogout();
    } finally {
      setStatus("anon");
    }
  }

  if (status === "checking") return null;

  if (status === "anon") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <form onSubmit={handleLogin} style={{ width: 320, background: "#fff", borderRadius: 10, padding: 28, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>Mayra Admin</h1>
          <p style={{ fontSize: 13, color: "#666", margin: "0 0 20px" }}>Enter the admin password to continue.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="Password"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #d0d3d9", fontSize: 14, marginBottom: 12 }}
          />
          {error && <p style={{ color: "#c0392b", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 14, cursor: submitting ? "wait" : "pointer" }}
          >
            {submitting ? "Checking…" : "Log in"}
          </button>
        </form>
      </div>
    );
  }

  return <AdminShell onLogout={handleLogout}>{children}</AdminShell>;
}
