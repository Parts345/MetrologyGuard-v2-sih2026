const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const origin = apiBase.replace(/\/api\/?$/, "");

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const assetUrl = (value?: string | null) => value ? `${origin}${value}` : "";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // Local-development identity only. Production requests receive their verified
  // identity from the configured OIDC flow or trusted server-side proxy.
  if (import.meta.env.DEV) {
    headers.set("x-user-role", "Administrator");
    headers.set("x-user-id", "usr-system");
    headers.set("x-user-name", "System Administrator");
  }
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.error?.message ?? "Request could not be completed.");
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
