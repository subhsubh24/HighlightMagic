import { describe, it, expect, beforeEach, vi } from "vitest";
import { cacheKey, getCachedAsset, setCachedAsset, clearAssetCache } from "./asset-cache";

// Mock localStorage
const storage = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: (index: number) => [...storage.keys()][index] ?? null,
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

beforeEach(() => {
  storage.clear();
});

describe("cacheKey", () => {
  it("returns a string starting with the prefix", () => {
    const key = cacheKey("music", { prompt: "test", duration: 5000 });
    expect(key).toContain("hm_asset_");
    expect(key).toContain("music_");
  });

  it("produces the same key for same inputs regardless of order", () => {
    const key1 = cacheKey("sfx", { a: 1, b: 2 });
    const key2 = cacheKey("sfx", { b: 2, a: 1 });
    expect(key1).toBe(key2);
  });

  it("produces different keys for different types", () => {
    const key1 = cacheKey("music", { prompt: "test" });
    const key2 = cacheKey("sfx", { prompt: "test" });
    expect(key1).not.toBe(key2);
  });
});

describe("getCachedAsset / setCachedAsset", () => {
  it("returns null on miss", () => {
    expect(getCachedAsset("nonexistent")).toBeNull();
  });

  it("stores and retrieves data", () => {
    const key = cacheKey("test", { id: 1 });
    setCachedAsset(key, "data:audio/mp3;base64,abc", { duration: 5 });
    const result = getCachedAsset(key);
    expect(result).not.toBeNull();
    expect(result!.data).toBe("data:audio/mp3;base64,abc");
    expect(result!.meta?.duration).toBe(5);
  });

  it("returns null for expired entries", () => {
    const key = cacheKey("test", { id: 2 });
    // Manually store with old timestamp
    storage.set(key, JSON.stringify({ data: "old", ts: Date.now() - 25 * 60 * 60 * 1000 }));
    expect(getCachedAsset(key)).toBeNull();
  });
});

// The cache is bounded to 50 entries to avoid unbounded localStorage growth; each generated
// asset (music/SFX/voiceover) is a large base64 data URI, so eviction correctness is real
// (a broken evictor either blows the storage quota or wrongly drops fresh entries). LRU/expiry
// eviction was previously untested.
describe("eviction at capacity (LRU + expiry)", () => {
  const MAX_ENTRIES = 50;
  const TTL_MS = 24 * 60 * 60 * 1000;

  it("evicts the oldest entry once MAX_ENTRIES is exceeded", () => {
    vi.useFakeTimers();
    try {
      const base = new Date("2026-05-01T00:00:00.000Z").getTime();
      const keys: string[] = [];
      // Fill to capacity with strictly increasing timestamps (1ms apart) for deterministic order.
      for (let i = 0; i < MAX_ENTRIES; i++) {
        vi.setSystemTime(base + i);
        const k = cacheKey("music", { i });
        keys.push(k);
        setCachedAsset(k, `data-${i}`);
      }
      expect(getCachedAsset(keys[0])?.data).toBe("data-0");

      // Inserting the 51st entry evicts the oldest (keys[0]); the rest survive.
      vi.setSystemTime(base + MAX_ENTRIES);
      const newest = cacheKey("music", { i: MAX_ENTRIES });
      setCachedAsset(newest, "newest");

      expect(getCachedAsset(keys[0])).toBeNull();
      expect(getCachedAsset(keys[1])?.data).toBe("data-1");
      expect(getCachedAsset(newest)?.data).toBe("newest");
    } finally {
      vi.useRealTimers();
    }
  });

  it("purges expired entries before applying the LRU cap", () => {
    vi.useFakeTimers();
    try {
      const base = new Date("2026-06-01T00:00:00.000Z").getTime();
      vi.setSystemTime(base);
      const stale = cacheKey("sfx", { id: "stale" });
      setCachedAsset(stale, "old");

      // Advance past the 24h TTL, then write a fresh entry — the stale one is swept out.
      vi.setSystemTime(base + TTL_MS + 1);
      const fresh = cacheKey("sfx", { id: "fresh" });
      setCachedAsset(fresh, "new");

      expect(getCachedAsset(stale)).toBeNull();
      expect(getCachedAsset(fresh)?.data).toBe("new");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("clearAssetCache", () => {
  it("removes all cache entries", () => {
    setCachedAsset(cacheKey("a", {}), "data1");
    setCachedAsset(cacheKey("b", {}), "data2");
    storage.set("unrelated_key", "keep");

    clearAssetCache();

    // Cache entries should be gone
    expect(getCachedAsset(cacheKey("a", {}))).toBeNull();
    expect(getCachedAsset(cacheKey("b", {}))).toBeNull();
    // Non-cache entries preserved
    expect(storage.get("unrelated_key")).toBe("keep");
  });
});
