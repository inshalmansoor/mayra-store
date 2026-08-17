// Typed calls against /api/admin/* — plans/03-backend-fastapi.md §5,
// plans/05-admin-panel.md. Every call here relies on the httpOnly session
// cookie; a 401 means "show the login card", handled by AdminGate.
import { api, apiUpload } from "./api";
import type {
  AdminImage,
  AdminNotifyRequest,
  AdminOrderDetail,
  AdminOrderList,
  AdminProduct,
  AdminShippingRate,
  AdminVariant,
} from "./admin-types";

export async function adminLogin(password: string): Promise<{ ok: true }> {
  return api.post("/api/admin/login", { password });
}

export async function adminLogout(): Promise<{ ok: true }> {
  return api.post("/api/admin/logout");
}

export async function adminMe(): Promise<{ ok: true }> {
  return api.getNoStore("/api/admin/me");
}

export async function adminListProducts(): Promise<AdminProduct[]> {
  return api.getNoStore("/api/admin/products");
}

export async function adminGetProduct(id: string): Promise<AdminProduct> {
  return api.getNoStore(`/api/admin/products/${id}`);
}

export interface ProductCreateInput {
  slug: string;
  name: string;
  category: string;
  collection?: string | null;
  basePrice: number;
  material?: string;
  blurb?: string;
  care?: string[];
  isActive?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
}

export async function adminCreateProduct(payload: ProductCreateInput): Promise<AdminProduct> {
  return api.post("/api/admin/products", payload);
}

export async function adminUpdateProduct(id: string, payload: Partial<ProductCreateInput>): Promise<AdminProduct> {
  return api.patch(`/api/admin/products/${id}`, payload);
}

export async function adminDeactivateProduct(id: string): Promise<{ ok: true }> {
  return api.delete(`/api/admin/products/${id}`);
}

export interface OptionValueInput {
  valueId: string;
  label: string;
  hex?: string | null;
  priceDelta?: number;
  position: number;
}
export interface OptionInput {
  key: string;
  label: string;
  type: "swatch" | "segment";
  position: number;
  values: OptionValueInput[];
}

export interface OptionsReplacePreview {
  preview: true;
  willRemoveCombinations: number;
  lostVariants: { variantKey: string; sku: string; stock: number }[];
  note: string;
}

export async function adminReplaceOptions(
  productId: string,
  options: OptionInput[],
  confirm: boolean,
): Promise<AdminProduct | OptionsReplacePreview> {
  return api.put(`/api/admin/products/${productId}/options`, { options, confirm });
}

export async function adminAddVariant(
  productId: string,
  variantKey: string,
  sku: string,
  stock: number,
): Promise<AdminVariant> {
  return api.post(`/api/admin/products/${productId}/variants`, { variantKey, sku, stock });
}

export async function adminUpdateVariant(id: string, payload: { stock?: number; sku?: string }): Promise<AdminVariant> {
  return api.patch(`/api/admin/variants/${id}`, payload);
}

export async function adminDeleteVariant(id: string): Promise<{ ok: true }> {
  return api.delete(`/api/admin/variants/${id}`);
}

export async function adminUploadImage(
  productId: string,
  file: File,
  colourKey: string,
  alt: string,
): Promise<AdminImage> {
  const form = new FormData();
  form.append("file", file);
  const qs = new URLSearchParams({ colour_key: colourKey || "default", alt: alt || "" });
  return apiUpload(`/api/admin/products/${productId}/images?${qs.toString()}`, form);
}

export async function adminDeleteImage(id: string): Promise<{ ok: true }> {
  return api.delete(`/api/admin/images/${id}`);
}

export async function adminListOrders(status?: string, page = 1): Promise<AdminOrderList> {
  const qs = new URLSearchParams({ page: String(page) });
  if (status) qs.set("status_filter", status);
  return api.getNoStore(`/api/admin/orders?${qs.toString()}`);
}

export async function adminGetOrder(id: string): Promise<AdminOrderDetail> {
  return api.getNoStore(`/api/admin/orders/${id}`);
}

export async function adminUpdateOrder(
  id: string,
  payload: { status?: string; paymentStatus?: string },
): Promise<AdminOrderDetail> {
  return api.patch(`/api/admin/orders/${id}`, payload);
}

export async function adminResendEmail(id: string): Promise<{ emailStatus: string; emailError: string | null }> {
  return api.post(`/api/admin/orders/${id}/resend-email`);
}

export async function adminListNotifyRequests(): Promise<AdminNotifyRequest[]> {
  return api.getNoStore("/api/admin/notify-requests");
}

export async function adminGetSettings(): Promise<Record<string, string>> {
  return api.getNoStore("/api/admin/settings");
}

export async function adminUpdateSetting(key: string, value: string): Promise<{ key: string; value: string }> {
  return api.patch(`/api/admin/settings/${key}`, { value });
}

export async function adminListShippingRates(): Promise<AdminShippingRate[]> {
  return api.getNoStore("/api/admin/shipping-rates");
}

export interface ShippingRateInput {
  label: string;
  deliveryEstimate?: string;
  fee: number;
  isDefault?: boolean;
  freeShippingEligible?: boolean;
  sortOrder?: number;
}

export async function adminCreateShippingRate(payload: ShippingRateInput): Promise<AdminShippingRate> {
  return api.post("/api/admin/shipping-rates", payload);
}

export async function adminUpdateShippingRate(
  id: string,
  payload: Partial<ShippingRateInput & { isActive: boolean }>,
): Promise<AdminShippingRate> {
  return api.patch(`/api/admin/shipping-rates/${id}`, payload);
}

export async function adminDeactivateShippingRate(id: string): Promise<{ ok: true }> {
  return api.delete(`/api/admin/shipping-rates/${id}`);
}
