// The admin panel is served by the storefront app under /admin, so the API is same-origin.
export const API_URL = "/api";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bc_admin_token");
}

export function setToken(token: string | null, refreshToken?: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("bc_admin_token", token);
  else localStorage.removeItem("bc_admin_token");
  if (refreshToken) localStorage.setItem("bc_admin_refresh", refreshToken);
  else if (!token || refreshToken === null) localStorage.removeItem("bc_admin_refresh");
}

let refreshing: Promise<boolean> | null = null;

/** Exchange the stored refresh token for a new pair (single-flight; refresh tokens are one-time use). */
async function refreshSession(): Promise<boolean> {
  const refreshToken = typeof window === "undefined" ? null : localStorage.getItem("bc_admin_refresh");
  if (!refreshToken) return false;
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          setToken(null);
          return false;
        }
        setToken(json.data.accessToken, json.data.refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: RequestInit = {}, retried = false): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  // Expired access token: refresh once and replay the request.
  if (res.status === 401 && token && !retried && (await refreshSession())) return api<T>(path, opts, true);
  if (!res.ok || !json?.success) {
    throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, json?.error?.code ?? "ERROR", res.status);
  }
  return json.data as T;
}

export const fmt = (n: any) =>
  "₹" + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const fmtDate = (d: any) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const fmtDateTime = (d: any) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
