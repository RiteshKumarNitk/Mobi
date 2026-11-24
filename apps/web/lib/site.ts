/** Public site settings shared by metadata, robots and sitemap (server-safe). */
export const SITE_NAME = "Baba Communication";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Base URL the Next.js *server* uses to reach the API (metadata, sitemap).
 * API_INTERNAL_URL can point to an internal hostname in Docker or Kubernetes.
 */
export const SERVER_API_URL = (process.env.API_INTERNAL_URL ?? (process.env.VERCEL_URL && !process.env.NEXT_PUBLIC_SITE_URL ? "https://" + process.env.VERCEL_URL + "/api" : SITE_URL + "/api")).replace(/\/$/, "");

/** Server-side fetch of public API data; returns null on any failure (never breaks rendering/builds). */
export async function fetchPublic<T>(path: string, revalidateSeconds = 300): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API_URL}${path}`, { next: { revalidate: revalidateSeconds }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as T) : null;
  } catch {
    return null;
  }
}

/** Client-review deployment on sample data: show a banner and keep search engines out. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Private, per-user pages that must never be indexed. */
export const NOINDEX = { robots: { index: false, follow: false } } as const;
