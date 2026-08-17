"use client";

// Card fields are format-validated client-side only and NEVER included in
// the order payload — see PLAN.md §3.3 and plans/03-backend-fastapi.md §4.1.
// The server recomputes every total from the database; nothing computed
// here is trusted for the write.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useProducts } from "@/lib/useProducts";
import { useSettings } from "@/lib/useSettings";
import { buildCartLines, computeTotals } from "@/lib/pricing";
import { createOrder, validateDiscount } from "@/lib/products";
import { fmt } from "@/lib/format";
import { ApiError } from "@/lib/api";
import { consumePendingDiscount } from "@/lib/pendingDiscount";
import { useToast } from "@/context/ToastContext";
import type { PaymentMethod } from "@/lib/types";

interface FormState {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postal: string;
  note: string;
  payMethod: PaymentMethod;
  card: string;
  expiry: string;
  cvc: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  postal: "",
  note: "",
  payMethod: "cod",
  card: "",
  expiry: "",
  cvc: "",
};

export default function CheckoutPage() {
  const { cart, hydrated, clearCart } = useCart();
  const { products, loading } = useProducts();
  const { settings } = useSettings();
  const { pushToast } = useToast();
  const router = useRouter();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [discountInput, setDiscountInput] = useState("");
  const [discountApplied, setDiscountApplied] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [conflictNote, setConflictNote] = useState<string | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);

  useEffect(() => {
    // Reads a value the promo popup/announcement bar stashed in
    // localStorage — a genuine external system, not derived render state.
    const pending = consumePendingDiscount();
    if (pending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDiscountInput(pending);
      applyDiscount(pending);
    }
  }, []);

  useEffect(() => {
    if (selectedRateId || !settings?.shippingRates?.length) return;
    const def = settings.shippingRates.find((r) => r.isDefault) ?? settings.shippingRates[0];
    if (def) setSelectedRateId(def.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.shippingRates]);

  if (!hydrated || loading) return <div style={{ padding: 60 }} />;

  const lines = buildCartLines(cart, products);
  if (lines.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 18, marginBottom: 20 }}>Your bag is empty.</p>
        <button onClick={() => router.push("/shop")} style={{ background: "var(--gold-500)", border: "none", color: "#2e2b25", borderRadius: 999, padding: "12px 26px", fontFamily: "var(--font-caps)", fontSize: 13, cursor: "pointer" }}>
          Browse the collection
        </button>
      </div>
    );
  }

  const settingsForTotals = {
    discountPercent: settings?.discountPercent ?? 20,
    shippingMultipleRatesEnabled: settings?.shippingMultipleRatesEnabled ?? false,
    shippingFreeAll: settings?.shippingFreeAll ?? false,
    shippingFreeThreshold: settings?.shippingFreeThreshold ?? 0,
    shippingRates: settings?.shippingRates ?? [],
  };
  const totals = computeTotals(cart, products, discountApplied, settingsForTotals, selectedRateId);
  const showRateSelector = settingsForTotals.shippingMultipleRatesEnabled && settingsForTotals.shippingRates.length > 1;

  async function applyDiscount(codeRaw: string) {
    const code = codeRaw.trim();
    if (!code) return;
    try {
      const res = await validateDiscount(code);
      if (res.valid) {
        setDiscountApplied(true);
        setDiscountError(null);
      } else {
        setDiscountApplied(false);
        setDiscountError("That code isn't valid");
      }
    } catch {
      setDiscountApplied(false);
      setDiscountError("That code isn't valid");
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errs.name = "Enter the name we should deliver to";
    if (!/^\d{7,}$/.test(form.phone.replace(/\D/g, ""))) errs.phone = "Enter a phone number we can reach you on";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = "Enter an email we can send your confirmation to";
    if (!form.address.trim()) errs.address = "Enter your delivery address";
    if (!form.city.trim()) errs.city = "Enter your city";
    if (form.payMethod === "card") {
      if (!/^\d{12,19}$/.test(form.card.replace(/\s/g, ""))) errs.card = "Enter a valid card number";
      if (!/^\d{2}\/\d{2}$/.test(form.expiry)) errs.expiry = "Use MM/YY";
      if (!/^\d{3,4}$/.test(form.cvc)) errs.cvc = "Enter the 3-digit code on the back";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handlePlaceOrder() {
    if (!validate()) return;
    if (totals.hasUnavailable) {
      pushToast("Remove sold-out items before checking out.");
      router.push("/cart");
      return;
    }
    setSubmitting(true);
    setConflictNote(null);
    try {
      const result = await createOrder({
        items: lines
          .filter((l) => l.available)
          .map((l) => ({ productSlug: l.productSlug, variantKey: l.variantKey, qty: l.qty })),
        customer: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          postalCode: form.postal.trim() || undefined,
          note: form.note.trim() || undefined,
        },
        paymentMethod: form.payMethod,
        // Card digits are NEVER sent — only the chosen method travels.
        discountCode: discountApplied ? discountInput.trim() : undefined,
        shippingRateId: selectedRateId,
      });

      try {
        window.sessionStorage.setItem(`mayra.order.${result.orderNumber}`, JSON.stringify(result));
      } catch {
        // non-fatal — the confirmation page will still show what it can
      }
      clearCart();
      router.push(`/order/${encodeURIComponent(result.orderNumber)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.problems) {
        setConflictNote(
          "Stock changed while you were checking out: " +
            err.problems
              .map((p) => (p.reason === "insufficient" ? `only ${p.available} left of one item` : "one item is no longer available"))
              .join(", ") +
            ". Please review your bag.",
        );
        pushToast("Some items changed — review your bag.");
      } else if (err instanceof ApiError) {
        pushToast(err.message2);
      } else {
        pushToast("Something went wrong. Please try again or message us on WhatsApp.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 80px" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, marginBottom: 24 }}>Checkout</h1>

      {conflictNote && (
        <div style={{ background: "#fdecea", color: "#8a2c1a", padding: 14, borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
          {conflictNote}
        </div>
      )}

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "var(--font-caps)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Delivery details</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Full name" value={form.name} error={errors.name} onChange={(v) => setField("name", v)} />
          <Field label="Phone" value={form.phone} error={errors.phone} onChange={(v) => setField("phone", v)} type="tel" />
          <Field label="Email" value={form.email} error={errors.email} onChange={(v) => setField("email", v)} type="email" />
          <Field label="Address" value={form.address} error={errors.address} onChange={(v) => setField("address", v)} textarea />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <Field label="City" value={form.city} error={errors.city} onChange={(v) => setField("city", v)} />
            <Field label="Postal code" value={form.postal} onChange={(v) => setField("postal", v)} optional />
          </div>
          <Field label="Order note (optional)" value={form.note} onChange={(v) => setField("note", v)} textarea optional />
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "var(--font-caps)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Payment</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(["cod", "card", "bank"] as PaymentMethod[]).map((m) => (
            <label key={m} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
              <input type="radio" name="payMethod" checked={form.payMethod === m} onChange={() => setField("payMethod", m)} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 15 }}>
                {m === "cod" ? "Cash on delivery" : m === "card" ? "Card" : "Bank transfer"}
              </span>
            </label>
          ))}
        </div>

        {form.payMethod === "card" && (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--ink-soft)" }}>
              This is a demo — card details are not sent anywhere and no charge is made.
            </p>
            <Field label="Card number" value={form.card} error={errors.card} onChange={(v) => setField("card", v)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Expiry (MM/YY)" value={form.expiry} error={errors.expiry} onChange={(v) => setField("expiry", v)} />
              <Field label="CVC" value={form.cvc} error={errors.cvc} onChange={(v) => setField("cvc", v)} />
            </div>
          </div>
        )}

        {form.payMethod === "bank" && settings?.bank && (
          <div style={{ marginTop: 14, background: "var(--surface)", borderRadius: 10, padding: 14, fontFamily: "var(--font-body)", fontSize: 14 }}>
            <p style={{ margin: "0 0 4px" }}>{settings.bank.name} · {settings.bank.accountTitle}</p>
            <p style={{ margin: 0 }}>Account: {settings.bank.accountNumber}</p>
            <p style={{ margin: 0 }}>IBAN: {settings.bank.iban}</p>
            <p style={{ margin: "8px 0 0", color: "var(--ink-soft)" }}>Send the receipt on WhatsApp after ordering and we&rsquo;ll confirm.</p>
          </div>
        )}
      </section>

      {showRateSelector && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: "var(--font-caps)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Delivery speed</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {settingsForTotals.shippingRates.map((r) => {
              const freeHere =
                (settingsForTotals.shippingFreeAll ||
                  (settingsForTotals.shippingFreeThreshold > 0 &&
                    totals.subtotalRaw - totals.discountRaw >= settingsForTotals.shippingFreeThreshold)) &&
                r.freeShippingEligible;
              return (
                <label key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="radio" name="shippingRate" checked={selectedRateId === r.id} onChange={() => setSelectedRateId(r.id)} />
                    <span>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 15 }}>{r.label}</div>
                      {r.deliveryEstimate && (
                        <div style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--ink-soft)" }}>{r.deliveryEstimate}</div>
                      )}
                    </span>
                  </span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>{freeHere ? "Free" : fmt(r.fee)}</span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "var(--font-caps)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Discount code</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={discountInput}
            onChange={(e) => {
              setDiscountInput(e.target.value);
              setDiscountApplied(false);
              setDiscountError(null);
            }}
            placeholder="MAYRA20"
            style={{ flex: 1, padding: "11px 14px", borderRadius: 8, border: "1px solid var(--line)" }}
          />
          <button
            onClick={() => applyDiscount(discountInput)}
            style={{ background: "var(--forest-500)", color: "#fff", border: "none", borderRadius: 8, padding: "0 18px", fontFamily: "var(--font-caps)", fontSize: 12, cursor: "pointer" }}
          >
            Apply
          </button>
        </div>
        {discountApplied && <p style={{ color: "var(--forest-500)", fontSize: 13, marginTop: 6 }}>Code applied — 20% off</p>}
        {discountError && <p style={{ color: "var(--clay-500)", fontSize: 13, marginTop: 6 }}>{discountError}</p>}
      </section>

      <section style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginBottom: 24 }}>
        <Row label="Subtotal" value={totals.subtotalLabel} />
        {totals.discountRaw > 0 && <Row label="Discount" value={"−" + totals.discountLabel} />}
        <Row label={totals.resolvedRate ? `Delivery (${totals.resolvedRate.label})` : "Delivery"} value={totals.deliveryLabel} />
        <Row label="Total" value={totals.totalLabel} big />
      </section>

      <button
        onClick={handlePlaceOrder}
        disabled={submitting}
        style={{
          width: "100%",
          minHeight: 52,
          border: "none",
          borderRadius: 999,
          background: "var(--gold-500)",
          color: "#2e2b25",
          fontFamily: "var(--font-caps)",
          fontSize: 14,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: submitting ? "wait" : "pointer",
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? "Placing order…" : "Place order"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  textarea = false,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  textarea?: boolean;
  optional?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const showError = touched && error;
  const common = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onBlur: () => setTouched(true),
    style: {
      width: "100%",
      padding: "11px 14px",
      borderRadius: 8,
      border: `1px solid ${showError ? "#c0392b" : "var(--line)"}`,
      fontFamily: "var(--font-body)",
      fontSize: 15,
    } as React.CSSProperties,
  };
  return (
    <div>
      <label style={{ display: "block", fontFamily: "var(--font-caps)", fontSize: 11, letterSpacing: "0.04em", color: "var(--ink-soft)", marginBottom: 4, textTransform: "uppercase" }}>
        {label} {optional && <span style={{ textTransform: "none" }}>(optional)</span>}
      </label>
      {textarea ? <textarea rows={2} {...common} /> : <input type={type} {...common} />}
      {showError && <p style={{ color: "#c0392b", fontSize: 12, margin: "4px 0 0" }}>{error}</p>}
    </div>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: big ? "var(--font-display)" : "var(--font-body)", fontSize: big ? 19 : 15, padding: "4px 0", fontWeight: big ? 600 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
