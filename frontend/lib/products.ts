// Typed calls against the public API — plans/03-backend-fastapi.md §3.
import { api } from "./api";
import type {
  Category,
  DiscountValidateResult,
  NotifyMePayload,
  OrderCreatePayload,
  OrderResult,
  Product,
  StoreSettings,
} from "./types";

export async function getProducts(): Promise<Product[]> {
  return api.get<Product[]>("/api/products");
}

export async function getProduct(slug: string): Promise<Product | null> {
  try {
    return await api.get<Product>(`/api/products/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export async function getCategories(): Promise<Category[]> {
  return api.get<Category[]>("/api/categories");
}

export async function getSettings(): Promise<StoreSettings> {
  return api.get<StoreSettings>("/api/settings");
}

export async function validateDiscount(code: string): Promise<DiscountValidateResult> {
  return api.post<DiscountValidateResult>("/api/discount/validate", { code });
}

export async function notifyMe(payload: NotifyMePayload): Promise<void> {
  await api.post<void>("/api/notify-me", payload);
}

export async function createOrder(payload: OrderCreatePayload): Promise<OrderResult> {
  return api.post<OrderResult>("/api/orders", payload);
}
