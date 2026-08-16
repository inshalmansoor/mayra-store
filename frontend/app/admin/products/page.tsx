"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { adminListProducts, adminUpdateProduct } from "@/lib/admin-api";
import type { AdminProduct } from "@/lib/admin-types";
import { fmt } from "@/lib/format";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    adminListProducts()
      .then(setProducts)
      .finally(() => setLoading(false));
  }

  // Fetch-on-mount from the admin API — a genuine external system.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(refresh, []);

  async function toggleActive(p: AdminProduct) {
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)));
    try {
      await adminUpdateProduct(p.id, { isActive: !p.isActive });
    } catch {
      refresh();
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Products</h1>
        <Link href="/admin/products/new" style={{ background: "#1a1a1a", color: "#fff", padding: "9px 16px", borderRadius: 6, fontSize: 14 }}>
          + New product
        </Link>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, overflow: "hidden" }}>
          {products.map((p) => {
            const stock = p.variants.reduce((s, v) => s + v.stock, 0);
            const thumb = p.images[0]?.url;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: "1px solid #eef0f3" }}>
                <div style={{ position: "relative", width: 40, height: 40, borderRadius: 6, overflow: "hidden", background: "#f4f5f7", flexShrink: 0 }}>
                  {thumb && <Image src={thumb} alt={p.name} fill sizes="40px" style={{ objectFit: "cover" }} />}
                </div>
                <Link href={`/admin/products/${p.id}`} style={{ flex: 1, fontSize: 14, color: "#1a1a1a" }}>
                  {p.name}
                </Link>
                <span style={{ fontSize: 13, color: "#8a8f99", width: 100 }}>{p.category}</span>
                <span style={{ fontSize: 13, color: stock === 0 ? "#c0392b" : "#1a1a1a", width: 90 }}>{fmt(p.basePrice)}</span>
                <span style={{ fontSize: 13, color: stock === 0 ? "#c0392b" : "#1a1a1a", width: 70 }}>{stock} in stock</span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#565a63" }}>
                  <input type="checkbox" checked={p.isActive} onChange={() => toggleActive(p)} />
                  Active
                </label>
              </div>
            );
          })}
          {products.length === 0 && <p style={{ padding: 16, color: "#8a8f99", fontSize: 14 }}>No products yet.</p>}
        </div>
      )}
    </div>
  );
}
