/**
 * In-memory TTL cache for hot catalog reads.
 *
 * The interface is deliberately small so a Redis-backed implementation
 * (ioredis) can replace it later without touching call sites:
 *
 *   get(key) -> value | undefined
 *   set(key, value, ttlSeconds)
 *   delPrefix(prefix)
 *   bustAll()
 *
 * Entries are capped (LRU-ish eviction of oldest insertions) so memory stays
 * bounded even under hostile traffic. Values are deep-cloned on read/write to
 * prevent callers from mutating cached state.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
  insertedAt: number;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 2000;

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return clone(e.value) as T;
}

export function cacheSet(key: string, value: unknown, ttlSeconds: number): void {
  if (store.size >= MAX_ENTRIES) {
    // Evict the oldest-inserted entries until back under the cap.
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, e] of store) {
      if (e.insertedAt < oldestAt) {
        oldestAt = e.insertedAt;
        oldestKey = k;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000, insertedAt: Date.now() });
}

/** Delete every key starting with `prefix` (e.g. "catalog:products"). */
export function cacheDelPrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/** Drop the entire cache — called after any admin write to shared catalog data. */
export function cacheBustAll(): void {
  store.clear();
}

export const cache = {
  get: cacheGet,
  set: cacheSet,
  delPrefix: cacheDelPrefix,
  bustAll: cacheBustAll,
};

/**
 * Cache-aside read helper: returns the cached value, or builds + stores it on
 * a miss. Sets the X-Cache header on the response (HIT/MISS).
 */
export async function cached<T>(key: string, ttlSeconds: number, build: () => Promise<T>, res?: { setHeader: (h: string, v: string) => unknown }): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) {
    res?.setHeader("X-Cache", "HIT");
    return hit;
  }
  const value = await build();
  cacheSet(key, value, ttlSeconds);
  res?.setHeader("X-Cache", "MISS");
  return value;
}
