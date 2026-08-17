// Client mirror of backend/app/pricing.py — keep the two in lockstep. If one
// changes, change the other, or the cart shows one total and the
// confirmation email shows a different one. See plans/03 §4.3, plans/04 §4.2,
// and plans/09 §16-19 for the shipping-rate resolution added there.
import { fmt } from "./format";
import { coverImage, getVariant, selectionLabel, variantPrice } from "./variants";
import type { Cart, CartLineComputed, Product, ShippingRate, StoreSettings, Totals } from "./types";

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

type ShippingSettings = Pick<
  StoreSettings,
  "shippingMultipleRatesEnabled" | "shippingFreeAll" | "shippingFreeThreshold" | "shippingRates"
>;

/** Which rate applies — plans/09 §18 step 1. In single-rate mode a client's
 * choice is never consulted, matching backend/app/shipping.py exactly:
 * the default rate is what's charged, full stop. */
export function resolveShippingRate(
  settings: Pick<StoreSettings, "shippingMultipleRatesEnabled" | "shippingRates">,
  selectedRateId: string | null,
): ShippingRate | null {
  const rates = settings.shippingRates ?? [];
  if (!settings.shippingMultipleRatesEnabled) {
    return rates.find((r) => r.isDefault) ?? rates[0] ?? null;
  }
  const chosen = selectedRateId ? rates.find((r) => r.id === selectedRateId) : null;
  return chosen ?? rates.find((r) => r.isDefault) ?? rates[0] ?? null;
}

/** First match wins — the shared spec with backend/app/pricing.py
 * resolve_delivery_fee(). Any change here needs the identical change there,
 * or the cart and the order total diverge. See plans/09 §18 step 2. */
export function resolveDeliveryFee(
  rate: ShippingRate | null,
  subtotalRaw: number,
  payable: number,
  settings: Pick<StoreSettings, "shippingFreeAll" | "shippingFreeThreshold">,
): number {
  if (subtotalRaw === 0 || !rate) return 0;
  if (settings.shippingFreeAll && rate.freeShippingEligible) return 0;
  if (settings.shippingFreeThreshold > 0 && payable >= settings.shippingFreeThreshold && rate.freeShippingEligible) {
    return 0;
  }
  return rate.fee;
}

export function computeTotals(
  cart: Cart,
  products: Product[],
  discountApplied: boolean,
  settings: Pick<StoreSettings, "discountPercent"> & ShippingSettings,
  selectedRateId: string | null = null,
): Totals {
  const lines = buildCartLines(cart, products);
  const subtotalRaw = lines.reduce((s, l) => s + (l.available ? l.lineTotalRaw : 0), 0);
  const hasUnavailable = lines.some((l) => !l.available);
  const discountRaw = discountApplied ? Math.round((subtotalRaw * settings.discountPercent) / 100) : 0;
  const payable = subtotalRaw - discountRaw;

  const resolvedRate = resolveShippingRate(settings, selectedRateId);
  const deliveryRaw = resolveDeliveryFee(resolvedRate, subtotalRaw, payable, settings);
  const totalRaw = payable + deliveryRaw;

  // Only meaningful while the resolved rate is actually free-shipping
  // eligible — otherwise it promises a discount that will never arrive.
  const threshold = settings.shippingFreeThreshold;
  const eligible = resolvedRate?.freeShippingEligible ?? false;
  const remaining = threshold > 0 && eligible ? Math.max(0, threshold - payable) : 0;

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
    resolvedRate,
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
