/**
 * Tests for kv-quota-store.ts (Vercel KV-backed durable quota store).
 *
 * Mocks @vercel/kv so no real KV connection is required. Tests verify:
 * - isKVConfigured() env-var detection
 * - VercelKVQuotaStore.get() → returns 0 on miss, stored value on hit
 * - VercelKVQuotaStore.increment() → calls kv.incr and returns new count
 * - Key format is "quota:{period}:{userId}" in both methods
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must be set up before importing the module under test (hoisted by Vitest).
const mockKv = {
  get: vi.fn<(key: string) => Promise<number | null>>(),
  incr: vi.fn<(key: string) => Promise<number>>(),
};
vi.mock("@vercel/kv", () => ({ kv: mockKv }));

import { VercelKVQuotaStore, isKVConfigured, KV_OP_TIMEOUT_MS } from "@/lib/kv-quota-store";

// ── isKVConfigured ────────────────────────────────────────────────────────────

describe("isKVConfigured", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when both env vars are absent", () => {
    expect(isKVConfigured()).toBe(false);
  });

  it("returns false when only KV_REST_API_URL is present", () => {
    vi.stubEnv("KV_REST_API_URL", "https://example.kv.vercel.app");
    expect(isKVConfigured()).toBe(false);
  });

  it("returns false when only KV_REST_API_TOKEN is present", () => {
    vi.stubEnv("KV_REST_API_TOKEN", "tok_secret");
    expect(isKVConfigured()).toBe(false);
  });

  it("returns true when both env vars are set", () => {
    vi.stubEnv("KV_REST_API_URL", "https://example.kv.vercel.app");
    vi.stubEnv("KV_REST_API_TOKEN", "tok_secret");
    expect(isKVConfigured()).toBe(true);
  });
});

// ── VercelKVQuotaStore ────────────────────────────────────────────────────────

describe("VercelKVQuotaStore", () => {
  let store: VercelKVQuotaStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new VercelKVQuotaStore();
  });

  // ── get() ────────────────────────────────────────────────────────────────

  describe("get()", () => {
    it("returns 0 when the KV key does not exist (null from kv.get)", async () => {
      mockKv.get.mockResolvedValueOnce(null);
      const result = await store.get("user-abc", "2026-06");
      expect(result).toBe(0);
    });

    it("returns the stored count when the key exists", async () => {
      mockKv.get.mockResolvedValueOnce(3);
      const result = await store.get("user-xyz", "2026-07");
      expect(result).toBe(3);
    });

    it("uses key format 'quota:{period}:{userId}'", async () => {
      mockKv.get.mockResolvedValueOnce(0);
      await store.get("user-123", "2025-12");
      expect(mockKv.get).toHaveBeenCalledWith("quota:2025-12:user-123");
    });

    it("includes the period before the userId in the key", async () => {
      mockKv.get.mockResolvedValueOnce(0);
      await store.get("user-A", "2026-01");
      const [key] = mockKv.get.mock.calls[0];
      expect(key).toMatch(/^quota:2026-01:user-A$/);
    });

    it("handles userId strings with special characters", async () => {
      mockKv.get.mockResolvedValueOnce(2);
      const result = await store.get("ABC-DEF-123-456", "2026-06");
      expect(result).toBe(2);
      expect(mockKv.get).toHaveBeenCalledWith("quota:2026-06:ABC-DEF-123-456");
    });
  });

  // ── increment() ───────────────────────────────────────────────────────────

  describe("increment()", () => {
    it("calls kv.incr with the correct key and returns the new count", async () => {
      mockKv.incr.mockResolvedValueOnce(1);
      const result = await store.increment("user-abc", "2026-06");
      expect(result).toBe(1);
      expect(mockKv.incr).toHaveBeenCalledWith("quota:2026-06:user-abc");
    });

    it("returns the value returned by kv.incr (not a local increment)", async () => {
      mockKv.incr.mockResolvedValueOnce(5);
      const result = await store.increment("user-abc", "2026-06");
      expect(result).toBe(5);
    });

    it("uses the same key format as get()", async () => {
      const userId = "user-789";
      const period = "2026-03";
      const expectedKey = `quota:${period}:${userId}`;

      mockKv.get.mockResolvedValueOnce(2);
      await store.get(userId, period);
      expect(mockKv.get).toHaveBeenCalledWith(expectedKey);

      mockKv.incr.mockResolvedValueOnce(3);
      await store.increment(userId, period);
      expect(mockKv.incr).toHaveBeenCalledWith(expectedKey);
    });

    it("different users produce different keys", async () => {
      mockKv.incr.mockResolvedValue(1);
      await store.increment("user-A", "2026-06");
      await store.increment("user-B", "2026-06");
      expect(mockKv.incr).toHaveBeenNthCalledWith(1, "quota:2026-06:user-A");
      expect(mockKv.incr).toHaveBeenNthCalledWith(2, "quota:2026-06:user-B");
    });

    it("different periods produce different keys for the same user", async () => {
      mockKv.incr.mockResolvedValue(1);
      await store.increment("user-A", "2026-05");
      await store.increment("user-A", "2026-06");
      expect(mockKv.incr).toHaveBeenNthCalledWith(1, "quota:2026-05:user-A");
      expect(mockKv.incr).toHaveBeenNthCalledWith(2, "quota:2026-06:user-A");
    });
  });

  // ── timeout (a hung KV must not burn the serverless budget) ─────────────────
  describe("timeout", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("get() rejects with a timeout error when KV hangs past KV_OP_TIMEOUT_MS", async () => {
      vi.useFakeTimers();
      mockKv.get.mockReturnValueOnce(new Promise<number>(() => {})); // never resolves
      const p = store.get("user-hang", "2026-06");
      const assertion = expect(p).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(KV_OP_TIMEOUT_MS + 100);
      await assertion;
    });

    it("increment() rejects with a timeout error when KV hangs past KV_OP_TIMEOUT_MS", async () => {
      vi.useFakeTimers();
      mockKv.incr.mockReturnValueOnce(new Promise<number>(() => {})); // never resolves
      const p = store.increment("user-hang", "2026-06");
      const assertion = expect(p).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(KV_OP_TIMEOUT_MS + 100);
      await assertion;
    });

    it("get() resolves normally when KV answers before the timeout", async () => {
      vi.useFakeTimers();
      mockKv.get.mockResolvedValueOnce(7);
      await expect(store.get("user-fast", "2026-06")).resolves.toBe(7);
    });
  });
});
