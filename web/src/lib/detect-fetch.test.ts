import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWithRetry,
  MAX_RETRIES,
  INITIAL_BACKOFF_MS,
  MAX_RETRY_WAIT_MS,
} from "./detect-fetch";

/**
 * These tests drive the reliability spine of the detection pipeline (every paid Anthropic call
 * goes through fetchWithRetry). `setTimeout` is stubbed to record the requested delay and invoke
 * the callback synchronously, so the exhaustion/cap/backoff paths run in microseconds while we
 * assert the EXACT production wait values.
 */

let sleeps: number[];

function resp(status: number, headers: Record<string, string> = {}): Response {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
  } as unknown as Response;
}

beforeEach(() => {
  sleeps = [];
  // Run timers synchronously and capture the requested delay.
  vi.stubGlobal("setTimeout", ((fn: () => void, ms?: number) => {
    sleeps.push(ms ?? 0);
    fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Build a fetch mock that returns/throws the queued items in order. */
function queuedFetch(items: Array<Response | Error>) {
  let i = 0;
  return vi.fn(async () => {
    const item = items[Math.min(i, items.length - 1)];
    i++;
    if (item instanceof Error) throw item;
    return item;
  });
}

describe("fetchWithRetry", () => {
  it("returns immediately on a first-attempt 2xx (no retry, no sleep)", async () => {
    const f = queuedFetch([resp(200)]);
    vi.stubGlobal("fetch", f);
    const r = await fetchWithRetry("http://x", {}, "label");
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("retries a 429 then succeeds, using the exponential backoff", async () => {
    const f = queuedFetch([resp(429), resp(200)]);
    vi.stubGlobal("fetch", f);
    const r = await fetchWithRetry("http://x", {}, "label");
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([INITIAL_BACKOFF_MS]); // 2000
  });

  it("retries a 529 (overloaded) then succeeds", async () => {
    const f = queuedFetch([resp(529), resp(200)]);
    vi.stubGlobal("fetch", f);
    const r = await fetchWithRetry("http://x", {}, "label");
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([INITIAL_BACKOFF_MS]);
  });

  it("honours a numeric Retry-After header (seconds → ms)", async () => {
    const f = queuedFetch([resp(429, { "retry-after": "3" }), resp(200)]);
    vi.stubGlobal("fetch", f);
    await fetchWithRetry("http://x", {}, "label");
    expect(sleeps).toEqual([3000]);
  });

  it("caps an oversized Retry-After at MAX_RETRY_WAIT_MS", async () => {
    const f = queuedFetch([resp(429, { "retry-after": "100" }), resp(200)]);
    vi.stubGlobal("fetch", f);
    await fetchWithRetry("http://x", {}, "label");
    expect(sleeps).toEqual([MAX_RETRY_WAIT_MS]); // 100s clamped to 15s
  });

  it("ignores a non-numeric/zero Retry-After and falls back to exponential backoff", async () => {
    const f = queuedFetch([
      resp(429, { "retry-after": "soon" }),
      resp(429, { "retry-after": "0" }),
      resp(200),
    ]);
    vi.stubGlobal("fetch", f);
    await fetchWithRetry("http://x", {}, "label");
    // attempt 0 → 2000, attempt 1 → 4000
    expect(sleeps).toEqual([INITIAL_BACKOFF_MS, INITIAL_BACKOFF_MS * 2]);
  });

  it("returns a non-retryable 4xx immediately without retrying", async () => {
    const f = queuedFetch([resp(400)]);
    vi.stubGlobal("fetch", f);
    const r = await fetchWithRetry("http://x", {}, "label");
    expect(r.status).toBe(400);
    expect(f).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("retries a thrown network error then succeeds", async () => {
    const f = queuedFetch([new Error("ECONNRESET"), resp(200)]);
    vi.stubGlobal("fetch", f);
    const r = await fetchWithRetry("http://x", {}, "label");
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([INITIAL_BACKOFF_MS]);
  });

  it("throws after exhausting retries on a persistent network error", async () => {
    const f = queuedFetch([new Error("dns fail")]);
    vi.stubGlobal("fetch", f);
    await expect(fetchWithRetry("http://x", {}, "label")).rejects.toThrow("dns fail");
    // attempts 0..5 = MAX_RETRIES+1 calls; the last (attempt===MAX_RETRIES) throws instead of sleeping.
    expect(f).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    expect(sleeps).toHaveLength(MAX_RETRIES);
  });

  it("makes a final post-loop attempt when 429 persists through every retry", async () => {
    const f = queuedFetch([resp(429)]); // always 429
    vi.stubGlobal("fetch", f);
    const r = await fetchWithRetry("http://x", {}, "label");
    expect(r.status).toBe(429);
    // 6 loop attempts (each 429 → sleep+continue) + 1 final post-loop attempt.
    expect(f).toHaveBeenCalledTimes(MAX_RETRIES + 2);
    expect(sleeps).toHaveLength(MAX_RETRIES + 1);
  });

  it("respects an injected config (fewer retries, custom backoff)", async () => {
    const f = queuedFetch([resp(429), resp(429), resp(200)]);
    vi.stubGlobal("fetch", f);
    const r = await fetchWithRetry("http://x", {}, "label", undefined, {
      maxRetries: 2,
      initialBackoffMs: 10,
      maxRetryWaitMs: 100,
    });
    expect(r.status).toBe(200);
    expect(sleeps).toEqual([10, 20]);
  });

  it("passes an AbortSignal when a timeout is supplied", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return resp(200);
    });
    vi.stubGlobal("fetch", f);
    const r = await fetchWithRetry("http://x", {}, "label", 5000);
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
