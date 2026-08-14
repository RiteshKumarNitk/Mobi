const KEY = "bc_recent";

/** Recently viewed product ids, most recent first. */
export function getRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Record a product view (deduped, capped at 12). */
export function pushRecentId(id: string): void {
  try {
    const ids = getRecentIds().filter((x) => x !== id);
    ids.unshift(id);
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 12)));
  } catch {
    /* storage unavailable - ignore */
  }
}
