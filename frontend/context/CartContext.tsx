"use client";

// Replaces the prototype's state.cart + addToCart/changeCartQty/removeCartLine.
// Persists to localStorage — the prototype could not do this (Claude Design
// artifacts have no storage), so this is a genuine upgrade from the port.
// See plans/04-frontend-nextjs.md §4.1.
//
// Hydration rule: initialise as empty, load from localStorage inside
// useEffect. Reading storage during the initial render makes the server
// HTML and the first client render disagree.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Cart, CartLine, Product, Selection } from "@/lib/types";
import { cartKeyFor, getVariant, variantKey as buildVariantKey } from "@/lib/variants";
import { reconcileCart } from "@/lib/pricing";

const STORAGE_KEY = "mayra.cart.v1";

interface CartContextValue {
  cart: Cart;
  hydrated: boolean;
  count: number;
  addToCart: (product: Product, selection: Selection, qty: number) => void;
  changeQty: (key: string, delta: number, cap: number) => void;
  removeLine: (key: string) => void;
  clearCart: () => void;
  reconcile: (products: Product[]) => string[]; // returns notes, per edge case 13
  qtyInCart: (product: Product, selection: Selection) => number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // localStorage is a real external system, unreadable during SSR/first
    // render — this is exactly the hydrate-after-mount pattern the
    // hydration rule at the top of this file describes.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setCart(JSON.parse(raw));
    } catch {
      // corrupted storage — ignore, start empty
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // storage full / unavailable — cart just won't persist this session
    }
  }, [cart, hydrated]);

  const addToCart = useCallback((product: Product, selection: Selection, qty: number) => {
    const key = cartKeyFor(product, selection);
    setCart((prev) => {
      const existing = prev[key];
      const line: CartLine = {
        productSlug: product.id,
        variantKey: buildVariantKey(product, selection),
        selection,
        qty: (existing ? existing.qty : 0) + qty,
      };
      return { ...prev, [key]: line };
    });
  }, []);

  const changeQty = useCallback((key: string, delta: number, cap: number) => {
    setCart((prev) => {
      const item = prev[key];
      if (!item) return prev;
      const nextQty = Math.max(0, Math.min(Math.max(cap, 0), item.qty + delta));
      const next = { ...prev };
      if (nextQty <= 0) delete next[key];
      else next[key] = { ...item, qty: nextQty };
      return next;
    });
  }, []);

  const removeLine = useCallback((key: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearCart = useCallback(() => setCart({}), []);

  const reconcile = useCallback((products: Product[]) => {
    let notes: string[] = [];
    setCart((prev) => {
      const result = reconcileCart(prev, products);
      notes = result.notes;
      return result.cart;
    });
    return notes;
  }, []);

  const qtyInCart = useCallback(
    (product: Product, selection: Selection) => {
      const key = cartKeyFor(product, selection);
      return cart[key]?.qty ?? 0;
    },
    [cart],
  );

  const count = useMemo(() => Object.values(cart).reduce((s, l) => s + l.qty, 0), [cart]);

  const value = useMemo(
    () => ({ cart, hydrated, count, addToCart, changeQty, removeLine, clearCart, reconcile, qtyInCart }),
    [cart, hydrated, count, addToCart, changeQty, removeLine, clearCart, reconcile, qtyInCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export { getVariant };
