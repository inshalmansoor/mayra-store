// One fetch wrapper for the whole app. Server components pass `revalidate`;
// mutations use `cache: "no-store"`. Parses the error envelope from
// plans/03-backend-fastapi.md §7 into a typed ApiError.
import type { OrderProblem } from "./types";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : "Request failed");
    this.status = status;
    this.detail = detail;
  }

  /** Field-level message, when the backend sent one plain string. */
  get message2(): string {
    if (typeof this.detail === "string") return this.detail;
    return "Something went wrong. Please try again or message us on WhatsApp.";
  }

  /** 409 stock-conflict problems, if this is that kind of error. */
  get problems(): OrderProblem[] | null {
    if (
      this.status === 409 &&
      this.detail &&
      typeof this.detail === "object" &&
      "problems" in (this.detail as Record<string, unknown>)
    ) {
      return (this.detail as { problems: OrderProblem[] }).problems;
    }
    return null;
  }
}

function apiBase(): string {
  if (typeof window !== "undefined") {
    // Browser: relative URLs work — the dev proxy / same-origin prod rewrite
    // in next.config.ts handles routing to the Python function.
    return "";
  }
  // Server (Server Components, route handlers): fetch() needs an absolute
  // URL. In dev this talks straight to the running FastAPI process; on
  // Vercel it targets the deployment's own origin, which then rewrites.
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:8000";
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  revalidate?: number | false;
  cache?: RequestCache;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const url = `${apiBase()}${path}`;
  const init: RequestInit & { next?: { revalidate?: number | false } } = {
    method: opts.method ?? "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "include", // admin session cookie
  };
  if (opts.revalidate !== undefined) {
    init.next = { revalidate: opts.revalidate };
  } else if (opts.cache) {
    init.cache = opts.cache;
  }

  const res = await fetch(url, init);

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const detail = data && typeof data === "object" && "detail" in (data as Record<string, unknown>)
      ? (data as { detail: unknown }).detail
      : data;
    throw new ApiError(res.status, detail);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, revalidate: number | false = 60) => request<T>(path, { revalidate }),
  getNoStore: <T>(path: string) => request<T>(path, { cache: "no-store" }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body, cache: "no-store" }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body, cache: "no-store" }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body, cache: "no-store" }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE", cache: "no-store" }),
};

/** multipart upload — used only by the admin image uploader. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    body: form,
    credentials: "include",
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? data.detail : data;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}
