// Response shapes for the admin API — richer than the public ProductOut
// because the admin needs row ids to edit individual options/variants/images.
// See backend/app/routers/admin.py _admin_product_dict().

export interface AdminOptionValue {
  id: string;
  valueId: string;
  label: string;
  hex: string | null;
  priceDelta: number;
  position: number;
}

export interface AdminOption {
  id: string;
  key: string;
  label: string;
  type: "swatch" | "segment";
  position: number;
  values: AdminOptionValue[];
}

export interface AdminVariant {
  id: string;
  variantKey: string;
  sku: string;
  stock: number;
}

export interface AdminImage {
  id: string;
  colourKey: string;
  url: string;
  alt: string;
  position: number;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  collection: string | null;
  basePrice: number;
  material: string;
  blurb: string;
  care: string[];
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  options: AdminOption[];
  variants: AdminVariant[];
  images: AdminImage[];
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  emailStatus: string;
}

export interface AdminOrderList {
  total: number;
  page: number;
  pageSize: number;
  orders: AdminOrderSummary[];
}

export interface AdminOrderItem {
  productName: string;
  selectionLabel: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  city: string;
  postalCode: string | null;
  note: string | null;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  subtotal: number;
  discountCode: string | null;
  discountAmount: number;
  deliveryFee: number;
  shippingLabel: string;
  total: number;
  emailStatus: string;
  emailError: string | null;
  items: AdminOrderItem[];
}

// Full admin shape — includes inactive rates and is_active, unlike the
// public ShippingRate. See backend/app/routers/admin.py _shipping_rate_dict.
export interface AdminShippingRate {
  id: string;
  label: string;
  deliveryEstimate: string;
  fee: number;
  isActive: boolean;
  isDefault: boolean;
  freeShippingEligible: boolean;
  sortOrder: number;
}

export interface AdminNotifyRequest {
  id: string;
  productSlug: string;
  productName: string;
  email: string;
  notified: boolean;
  createdAt: string;
}

export const ORDER_STATUSES = ["new", "confirmed", "packed", "shipped", "delivered", "cancelled"] as const;
export const PAYMENT_STATUSES = ["pending", "awaiting_transfer", "simulated", "paid", "refunded"] as const;
