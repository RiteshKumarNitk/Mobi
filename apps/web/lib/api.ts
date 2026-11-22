export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

const TOKEN_KEY = "bc_token";
const REFRESH_KEY = "bc_refresh";

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return store()?.getItem(TOKEN_KEY) ?? null;
}

/** Save (or clear, with null) the session. The refresh token is kept so sessions survive access-token expiry. */
export function setToken(token: string | null, refreshToken?: string | null) {
  const s = store();
  if (!s) return;
  if (token) s.setItem(TOKEN_KEY, token);
  else s.removeItem(TOKEN_KEY);
  if (refreshToken) s.setItem(REFRESH_KEY, refreshToken);
  else if (!token || refreshToken === null) s.removeItem(REFRESH_KEY);
}

export function getDeviceId(): string {
  const s = store();
  if (!s) return "";
  let id = s.getItem("bc_device");
  if (!id) {
    id = crypto.randomUUID();
    s.setItem("bc_device", id);
  }
  return id;
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

// One in-flight refresh shared by concurrent requests (refresh tokens are single-use).
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = store()?.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          setToken(null);
          return false;
        }
        setToken(json.data.accessToken, json.data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

export async function api<T = any>(path: string, opts: RequestInit = {}, retried = false): Promise<T> {
  const token = getToken();
  const deviceId = getDeviceId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (deviceId) headers["x-device-id"] = deviceId;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  // Expired access token: refresh once and replay the request.
  if (res.status === 401 && token && !retried && !path.startsWith("/auth/refresh")) {
    if (await refreshSession()) return api<T>(path, opts, true);
  }
  if (!res.ok || !json?.success) {
    throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, json?.error?.code ?? "ERROR", res.status);
  }
  return json.data as T;
}

/** Only allow same-site relative redirect targets (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
