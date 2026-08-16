"use client";

// Shared client-side product fetch — used by pages whose data (cart,
// wishlist) lives in localStorage and therefore can't be rendered
// server-side. A plain module-scope cache avoids refetching between pages
// in the same session.
import { useEffect, useState } from "react";
import type { Product } from "./types";

let cache: Product[] | null = null;
let inflight: Promise<Product[]> | null = null;

async function load(): Promise<Product[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/products")
      .then((r) => r.json())
      .then((data: Product[]) => {
        cache = data;
        return data;
      })
      .catch(() => []);
  }
  return inflight;
}

export function useProducts(): { products: Product[]; loading: boolean } {
  const [products, setProducts] = useState<Product[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let mounted = true;
    load().then((data) => {
      if (mounted) {
        setProducts(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { products, loading };
}
