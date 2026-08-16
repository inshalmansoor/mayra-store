// The promo popup and announcement bar send shoppers to /shop?discount=CODE.
// Stashing it here lets checkout pre-fill the discount field later without
// threading it through page props. Mirrors the prototype's
// pendingDiscountCode state, just persisted across the navigation.
const KEY = "mayra.pendingDiscount.v1";

export function setPendingDiscount(code: string) {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    // non-fatal
  }
}

export function consumePendingDiscount(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v) window.localStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
