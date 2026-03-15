/**
 * Content-hash cache for generated assets (music, SFX, voiceover).
 *
 * Hashes the prompt + parameters, checks localStorage before calling the
 * expensive ElevenLabs API. On cache hit, returns the stored data URI
 * instantly — saving both time and money on re-detections.
 *
 * Cache entries expire after 24 hours to prevent stale data accumulation.
 * Maximum 50 entries — LRU eviction when full.
 */

const CACHE_PREFIX = "hm_asset_";
const MAX_ENTRIES = 50;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  /** The cached result (base64 data URI) */
  data: string;
  /** Optional metadata (e.g., duration) */
  meta?: Record<string, unknown>;
  /** Timestamp when cached */
  ts: number;
}

/**
 * Generate a simple hash from a string.
 * Uses djb2 — fast, good distribution, no crypto needed for cache keys.
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Build a cache key from asset type + generation parameters.
 */
export function cacheKey(type: string, params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  return `${CACHE_PREFIX}${type}_${hashString(sorted)}`;
}

/**
 * Look up a cached asset. Returns null on miss or expired entry.
 */
export function getCachedAsset(key: string): { data: string; meta?: Record<string, unknown> } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return { data: entry.data, meta: entry.meta };
  } catch (e) {
    console.warn("[Cache] getCachedAsset failed for key:", key, e);
    return null;
  }
}

/**
 * Store an asset in the cache. Evicts oldest entries if over capacity.
 */
export function setCachedAsset(key: string, data: string, meta?: Record<string, unknown>): void {
  try {
    // Evict expired and enforce max entries
    evictIfNeeded();

    const entry: CacheEntry = { data, ts: Date.now(), meta };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    console.warn("[Cache] setCachedAsset failed (storage full?):", key, e);
  }
}

function evictIfNeeded(): void {
  try {
    // Collect all cache keys first — removing during iteration shifts indices
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) allKeys.push(k);
    }

    const valid: { key: string; ts: number }[] = [];
    const expired: string[] = [];

    for (const k of allKeys) {
      try {
        const entry: CacheEntry = JSON.parse(localStorage.getItem(k)!);
        if (Date.now() - entry.ts > TTL_MS) {
          expired.push(k);
        } else {
          valid.push({ key: k, ts: entry.ts });
        }
      } catch (e) {
        console.warn("[Cache] Failed to parse cache entry:", k, e);
        expired.push(k);
      }
    }

    // Remove expired entries (safe — not iterating localStorage)
    for (const k of expired) localStorage.removeItem(k);

    // If still over limit, remove oldest
    if (valid.length >= MAX_ENTRIES) {
      valid.sort((a, b) => a.ts - b.ts);
      const toRemove = valid.length - MAX_ENTRIES + 1;
      for (let i = 0; i < toRemove; i++) {
        localStorage.removeItem(valid[i].key);
      }
    }
  } catch (e) {
    console.warn("[Cache] evictIfNeeded failed:", e);
  }
}

/**
 * Clear all cached assets.
 */
export function clearAssetCache(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.warn("[Cache] clearAssetCache failed:", e);
  }
}
