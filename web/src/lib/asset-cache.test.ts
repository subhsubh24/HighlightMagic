import { describe, it, expect, beforeEach } from "vitest";
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
