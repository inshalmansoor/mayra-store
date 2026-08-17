// Shape mirrors backend/app/schemas.py ProductOut exactly — see
// plans/03-backend-fastapi.md §3. The API returns camelCase; these types are
// the contract between the two.

export type OptionType = "swatch" | "segment";

export interface OptionValue {
  id: string;
  label: string;
  hex?: string | null;
  priceDelta?: number;
}

export interface ProductOption {
  key: string;
  label: string;
  type: OptionType;
  values: OptionValue[];
}

export interface Variant {
  sku: string;
  stock: number;
}

export interface Product {
  id: string; // slug — the public identifier
  name: string;
  category: string;
  collection: string | null;
  basePrice: number;
  material: string;
  blurb: string;
  care: string[];
  isFeatured: boolean;
  images: Record<string, string[]>; // colourKey -> image urls, 'default' fallback
  options: ProductOption[];
  variants: Record<string, Variant>; // variantKey -> variant
}

export interface Category {
  slug: string;
  label: string;
}

export interface BankDetails {
  name: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
}

export interface Announcement {
  enabled: boolean;
  text: string;
}

// Mirrors backend/app/schemas.py ShippingRateOut — the public, active-only
// shape. isDefault doubles as "the only rate charged when
// shippingMultipleRatesEnabled is false" — see plans/09 §16-18.
export interface ShippingRate {
  id: string;
  label: string;
  deliveryEstimate: string;
  fee: number;
  isDefault: boolean;
  freeShippingEligible: boolean;
}

export interface StoreSettings {
  storeName: string;
  currency: string;
  whatsappNumber: string;
  instagramUrl: string;
  lowStockAt: number;
  discountCode: string;
  discountPercent: number;
  bank: BankDetails;
  announcement: Announcement;
  promoPopupEnabled: boolean;
  shippingMultipleRatesEnabled: boolean;
  shippingFreeAll: boolean;
  shippingFreeThreshold: number;
  shippingRates: ShippingRate[];
}

// Selection: { colour: 'gold', length: '18' }
export type Selection = Record<string, string>;

export type ValueState = "available" | "soldout" | "nonexistent";

// --- Cart --------------------------------------------------------------
export interface CartLine {
  productSlug: string;
  variantKey: string;
  selection: Selection;
  qty: number;
}

export type Cart = Record<string, CartLine>; // key: cartKeyFor()

// --- Checkout / orders ---------------------------------------------------
export type PaymentMethod = "cod" | "bank" | "card";

export interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode?: string;
  note?: string;
}

export interface OrderItemPayload {
  productSlug: string;
  variantKey: string;
  qty: number;
}

export interface OrderCreatePayload {
  items: OrderItemPayload[];
  customer: CustomerDetails;
  paymentMethod: PaymentMethod;
  discountCode?: string | null;
  // Ignored server-side when shippingMultipleRatesEnabled is off — see
  // plans/09 §20.
  shippingRateId?: string | null;
}

export interface OrderLine {
  productName: string;
  selectionLabel: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface OrderResult {
  orderNumber: string;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  shippingLabel: string;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  items: OrderLine[];
}

export interface OrderProblem {
  productSlug: string;
  variantKey: string;
  reason: "unavailable" | "insufficient";
  available: number;
}

export interface DiscountValidateResult {
  valid: boolean;
  percent: number;
}

export interface NotifyMePayload {
  productSlug: string;
  email: string;
}

// --- Local computed totals (mirrors backend/app/pricing.py) ------------
export interface CartLineComputed extends CartLine {
  product: Product | null;
  available: boolean;
  unitPrice: number;
  lineTotalRaw: number;
  lineTotalLabel: string;
  selectionLabel: string;
  stock: number;
}

export interface Totals {
  lines: CartLineComputed[];
  subtotalRaw: number;
  subtotalLabel: string;
  discountRaw: number;
  discountLabel: string;
  hasUnavailable: boolean;
  deliveryRaw: number;
  deliveryLabel: string;
  totalRaw: number;
  totalLabel: string;
  freeDeliveryHint: string | null;
  // The rate actually resolved and priced — null only when the store has no
  // active shipping rate configured at all.
  resolvedRate: ShippingRate | null;
}
