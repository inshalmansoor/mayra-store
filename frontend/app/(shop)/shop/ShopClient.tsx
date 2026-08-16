"use client";

// Filters/sort live in the URL (/shop?category=rings&sort=price-asc&inStock=1)
// — shareable and back-button-correct, an upgrade over the prototype's
// component state. See plans/04-frontend-nextjs.md §3.
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Category, Product } from "@/lib/types";
import { isSoldOut } from "@/lib/variants";
import CatalogueGrid from "@/components/CatalogueGrid";
import { setPendingDiscount } from "@/lib/pendingDiscount";
import { useToast } from "@/context/ToastContext";

const SORT_OPTIONS = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "newest", label: "Newest" },
];

export default function ShopClient({ products, categories }: { products: Product[]; categories: Category[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();

  const category = searchParams.get("category") || "all";
  const sort = searchParams.get("sort") || "featured";
  const inStockOnly = searchParams.get("inStock") === "1";
  const discount = searchParams.get("discount");
  const notice = searchParams.get("notice");

  useEffect(() => {
    if (discount) {
      setPendingDiscount(discount);
      pushToast(`Code ${discount} will apply at checkout`);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("discount");
      router.replace(`/shop${params.toString() ? "?" + params.toString() : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discount]);

  useEffect(() => {
    if (notice === "missing") {
      pushToast("That piece isn't available anymore.");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("notice");
      router.replace(`/shop${params.toString() ? "?" + params.toString() : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`/shop${params.toString() ? "?" + params.toString() : ""}`);
  }

  const filtered = useMemo(() => {
    let list = products.slice();
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (inStockOnly) list = list.filter((p) => !isSoldOut(p));

    if (sort === "price-asc") list.sort((a, b) => a.basePrice - b.basePrice);
    else if (sort === "price-desc") list.sort((a, b) => b.basePrice - a.basePrice);
    else if (sort === "newest") list.reverse();

    return list;
  }, [products, category, inStockOnly, sort]);

  const noResultsFromFilter = filtered.length === 0 && (category !== "all" || inStockOnly);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 60px" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, margin: "0 0 20px" }}>Shop the collection</h1>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 14 }}>
        <Chip active={category === "all"} onClick={() => setParam("category", "all")}>
          All
        </Chip>
        {categories.map((c) => (
          <Chip key={c.slug} active={category === c.slug} onClick={() => setParam("category", c.slug)}>
            {c.label}
          </Chip>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 26 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-caps)", fontSize: 12, letterSpacing: "0.04em" }}>
          <input type="checkbox" checked={inStockOnly} onChange={(e) => setParam("inStock", e.target.checked ? "1" : null)} />
          In stock only
        </label>

        <select
          value={sort}
          onChange={(e) => setParam("sort", e.target.value)}
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-caps)",
            fontSize: 12,
            letterSpacing: "0.04em",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--line)",
            background: "#fff",
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div aria-live="polite" style={{ fontFamily: "var(--font-caps)", fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>
        {filtered.length} piece{filtered.length === 1 ? "" : "s"}
      </div>

      <CatalogueGrid
        products={filtered}
        emptyTitle={noResultsFromFilter ? "Nothing matches these filters." : "Nothing here yet."}
        emptyAction={
          noResultsFromFilter ? (
            <button
              onClick={() => router.push("/shop")}
              style={{ background: "none", border: "1px solid var(--gold-500)", color: "var(--gold-700)", borderRadius: 999, padding: "10px 20px", fontFamily: "var(--font-caps)", fontSize: 12, letterSpacing: "0.06em", cursor: "pointer" }}
            >
              Clear filters
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        whiteSpace: "nowrap",
        padding: "8px 16px",
        minHeight: 36,
        borderRadius: 999,
        border: active ? "1px solid var(--gold-700)" : "1px solid var(--line)",
        background: active ? "var(--gold-100)" : "#fff",
        color: active ? "var(--gold-700)" : "var(--ink)",
        fontFamily: "var(--font-caps)",
        fontSize: 12,
        letterSpacing: "0.04em",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
