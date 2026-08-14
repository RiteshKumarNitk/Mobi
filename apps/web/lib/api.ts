export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bc_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("bc_token", token);
  else localStorage.removeItem("bc_token");
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("bc_device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("bc_device", id);
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

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
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
  if (!res.ok || !json?.success) {
    throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, json?.error?.code ?? "ERROR", res.status);
  }
  return json.data as T;
}
