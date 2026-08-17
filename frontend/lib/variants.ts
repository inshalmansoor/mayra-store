// Ported verbatim from reference/Mayra Store.dc.html lines 741-757 — this is
// the most-tested code in the prototype and encodes all 20 variant/stock
// edge cases from plans/04-frontend-nextjs.md §7. Do not "improve" this
// without re-walking that checklist.
//
// variant_key contract: options joined by their `position` order (which the
// API already returns sorted), values joined with '|'. Products with no
// options use the literal key 'default'. See plans/02-database.md §4.

import type { OptionValue, Product, ProductOption, Selection, ValueState, Variant } from "./types";

// Products can briefly have zero images while being set up in admin (or a
// colour with no images of its own). Falling through to an empty string
// isn't safe — next/image throws/warns on src="" and would download the
// whole page again trying to resolve it — so every path here always
// resolves to a real, renderable image.
const PLACEHOLDER = "/placeholder.svg";

export function coverImage(p: Product, colourId: string | null | undefined, w = 500): string {
  const set = colourId && p.images[colourId]?.length ? p.images[colourId] : p.images.default;
  return withWidth((set ?? [])[0] ?? PLACEHOLDER, w);
}

export function galleryImages(p: Product, colourId: string | null | undefined, w = 1000): string[] {
  const set = colourId && p.images[colourId]?.length ? p.images[colourId] : p.images.default;
  const urls = (set ?? []).map((url) => withWidth(url, w));
  return urls.length ? urls : [PLACEHOLDER];
}

function withWidth(url: string, w: number): string {
  if (!url) return url;
  // Unsplash URLs already carry a width param from the seed; Supabase Storage
  // URLs have no resizing service on the free tier, so this is a no-op there.
  if (url.includes("images.unsplash.com")) {
    return url.replace(/w=\d+/, `w=${w}`);
  }
  return url;
}

export function variantKey(p: Product, sel: Selection): string {
  return p.options.length ? p.options.map((o) => sel[o.key]).join("|") : "default";
}

export function getVariant(p: Product, sel: Selection): Variant | undefined {
  return p.variants[variantKey(p, sel)];
}

export function optionValue(opt: ProductOption, id: string | undefined): OptionValue | undefined {
  return opt.values.find((v) => v.id === id);
}

export function variantPrice(p: Product, sel: Selection): number {
  let price = p.basePrice;
  p.options.forEach((o) => {
    const v = optionValue(o, sel[o.key]);
    if (v?.priceDelta) price += v.priceDelta;
  });
  return price;
}

export function isAvailable(p: Product, sel: Selection): boolean {
  const v = getVariant(p, sel);
  return !!v && v.stock > 0;
}

export function valueState(p: Product, sel: Selection, optKey: string, valueId: string): ValueState {
  const testSel = { ...sel, [optKey]: valueId };
  const v = p.variants[variantKey(p, testSel)];
  if (!v) return "nonexistent";
  if (v.stock <= 0) return "soldout";
  return "available";
}

export function optionValueHasAnyStock(p: Product, optKey: string, valueId: string): boolean {
  const idx = p.options.findIndex((o) => o.key === optKey);
  return Object.keys(p.variants).some((key) => {
    const parts = key.split("|");
    return parts[idx] === valueId && p.variants[key].stock > 0;
  });
}

export function optionValueExistsAtAll(p: Product, optKey: string, valueId: string): boolean {
  const idx = p.options.findIndex((o) => o.key === optKey);
  return Object.keys(p.variants).some((key) => {
    const parts = key.split("|");
    return parts[idx] === valueId;
  });
}

export function firstAvailable(p: Product): Selection | null {
  const keys = Object.keys(p.variants);
  for (const key of keys) {
    if (p.variants[key].stock > 0) {
      if (!p.options.length) return {};
      const parts = key.split("|");
      const sel: Selection = {};
      p.options.forEach((o, i) => {
        sel[o.key] = parts[i];
      });
      return sel;
    }
  }
  return null;
}

export function productStock(p: Product): number {
  return Object.values(p.variants).reduce((s, v) => s + v.stock, 0);
}

export function isSoldOut(p: Product): boolean {
  return productStock(p) === 0;
}

export function isSingleCombination(p: Product): boolean {
  return Object.keys(p.variants).length === 1;
}

export function cartKeyFor(p: Product, sel: Selection): string {
  return p.id + "|" + variantKey(p, sel);
}

export function selectionLabel(p: Product, sel: Selection): string {
  return p.options
    .map((o) => {
      const v = optionValue(o, sel[o.key]);
      return v ? v.label : null;
    })
    .filter(Boolean)
    .join(" · ");
}

/** Parses a cartKeyFor() key back into { productSlug, variantKey }. */
export function parseCartKey(key: string): { productSlug: string; variantKey: string } {
  const idx = key.indexOf("|");
  return { productSlug: key.slice(0, idx), variantKey: key.slice(idx + 1) };
}

/** Rebuilds a Selection object from a raw variant_key string, using the
 * product's declared option order (mirrors backend pricing.py). */
export function selectionFromVariantKey(p: Product, vKey: string): Selection {
  if (vKey === "default" || !p.options.length) return {};
  const parts = vKey.split("|");
  const sel: Selection = {};
  p.options.forEach((o, i) => {
    sel[o.key] = parts[i];
  });
  return sel;
}
