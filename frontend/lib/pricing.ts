// Client mirror of backend/app/pricing.py — keep the two in lockstep. If one
// changes, change the other, or the cart shows one total and the
// confirmation email shows a different one. See plans/03 §4.3, plans/04 §4.2.
import { fmt } from "./format";
import { coverImage, getVariant, selectionLabel, variantPrice } from "./variants";
import type { Cart, CartLineComputed, Product, StoreSettings, Totals } from "./types";

export function buildCartLines(cart: Cart, products: Product[]): CartLineComputed[] {
  return Object.values(cart).map((item) => {
    const product = products.find((p) => p.id === item.productSlug) ?? null;
    if (!product) {
      return {
        ...item,
        product: null,
        available: false,
        unitPrice: 0,
        lineTotalRaw: 0,
        lineTotalLabel: fmt(0),
        selectionLabel: "",
        stock: 0,
      };
    }
    const variant = getVariant(product, item.selection);
    const stock = variant ? variant.stock : 0;
    const available = !!variant && variant.stock > 0;
    const unitPrice = variantPrice(product, item.selection);
    const lineTotalRaw = available ? unitPrice * item.qty : 0;
    return {
      ...item,
      product,
      available,
      unitPrice,
      lineTotalRaw,
      lineTotalLabel: available ? fmt(lineTotalRaw) : fmt(0),
      selectionLabel: selectionLabel(product, item.selection),
      stock,
    };
  });
}

export function lineImage(line: CartLineComputed, w = 300): string {
  if (!line.product) return "";
  return coverImage(line.product, line.selection.colour, w);
}

export function computeTotals(
  cart: Cart,
  products: Product[],
  discountApplied: boolean,
  settings: Pick<StoreSettings, "discountPercent" | "freeDeliveryThreshold" | "deliveryFee">,
): Totals {
  const lines = buildCartLines(cart, products);
  const subtotalRaw = lines.reduce((s, l) => s + (l.available ? l.lineTotalRaw : 0), 0);
  const hasUnavailable = lines.some((l) => !l.available);
  const discountRaw = discountApplied ? Math.round((subtotalRaw * settings.discountPercent) / 100) : 0;
  const payable = subtotalRaw - discountRaw;
  const deliveryRaw = subtotalRaw > 0 && payable < settings.freeDeliveryThreshold ? settings.deliveryFee : 0;
  const totalRaw = payable + deliveryRaw;
  const remaining = Math.max(0, settings.freeDeliveryThreshold - payable);

  return {
    lines,
    subtotalRaw,
    subtotalLabel: fmt(subtotalRaw),
    discountRaw,
    discountLabel: fmt(discountRaw),
    hasUnavailable,
    deliveryRaw,
    deliveryLabel: deliveryRaw === 0 ? "Free" : fmt(deliveryRaw),
    totalRaw,
    totalLabel: fmt(totalRaw),
    freeDeliveryHint: remaining > 0 && subtotalRaw > 0 ? `${fmt(remaining)} more for free delivery` : null,
  };
}

/**
 * Reconciles a persisted cart against fresh product/stock data — the cart
 * now survives across days in localStorage while stock changes on the
 * server, so this must run on cart mount (edge cases 12-13 from
 * plans/04 §7). Caps quantity down to available stock and returns a
 * human-readable note; never silently removes a line.
 */
export function reconcileCart(cart: Cart, products: Product[]): { cart: Cart; notes: string[] } {
  const notes: string[] = [];
  let changed = false;
  const next: Cart = { ...cart };

  for (const key of Object.keys(next)) {
    const item = next[key];
    const product = products.find((p) => p.id === item.productSlug);
    if (!product) continue;
    const variant = getVariant(product, item.selection);
    const cap = variant ? variant.stock : 0;
    if (cap > 0 && item.qty > cap) {
      notes.push(`Only ${cap} left — quantity reduced from ${item.qty} for ${product.name}.`);
      next[key] = { ...item, qty: cap };
      changed = true;
    }
  }

  return changed ? { cart: next, notes } : { cart, notes: [] };
}
