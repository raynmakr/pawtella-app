/**
 * Browser-side fetch helper. Always relative to this app's own `/api` (the BFF proxy in
 * src/app/api/[...path]/route.ts), which injects the auth cookie and forwards to the API.
 *
 *   const { pets } = await api<{ pets: Pet[] }>("/api/pets");
 *   await api("/api/pets", { method: "POST", json: { name: "Mochi", species: "cat" } });
 */
export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export interface ApiInit extends Omit<RequestInit, "body"> {
  /** JSON-encoded body (sets Content-Type). */
  json?: unknown;
  /** Raw body (FormData, Blob, string). */
  body?: BodyInit | null;
  /** Query string params appended to the path. */
  query?: Record<string, string | number | boolean | null | undefined>;
}

export function buildQuery(query?: ApiInit["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function parseApiResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : null) ?? (typeof data === "string" && data ? data : res.statusText || "Request failed");
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

export async function api<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, query, headers, body, ...rest } = init;
  const h = new Headers(headers);
  h.set("Accept", "application/json");
  let finalBody: BodyInit | null | undefined = body;
  if (json !== undefined) {
    h.set("Content-Type", "application/json");
    finalBody = JSON.stringify(json);
  }
  const url = (path.startsWith("/") ? path : `/${path}`) + buildQuery(query);
  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers: h, body: finalBody, credentials: "same-origin" });
  } catch (err) {
    throw new ApiError(0, "You appear to be offline. Check your connection and try again.", err);
  }
  return parseApiResponse<T>(res);
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (isApiError(err)) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}
