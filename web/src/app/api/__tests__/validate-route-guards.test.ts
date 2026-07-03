/**
 * Track H1 / P0 / H7 — behavioral proof that /api/validate HONORS its wallet-drain guards.
 *
 * /api/validate is the reel's LARGEST paid route (a Haiku *vision* call over every clip frame),
 * yet it is deliberately absent from paid-routes-rate-limit.test.ts and generation-ceiling-
 * block.test.ts. Its existing tests (validate-waitlist-routes / h-hardening / validation-cost-
 * metering) only cover the no-key fail-open, empty/missing clips, and the H2 size bounds — they
 * never assert that the wired per-IP rate limit (H1), the server-side quota gate (402 / P0) and
 * the per-user daily generation ceiling (429 / H7) actually SHORT-CIRCUIT the paid call.
 *
 * A regression like `await checkExportAllowed(...)` whose 402 is no longer returned, or an
 * `enforceGenerationCeiling(...)` whose 429 is dropped, would keep those source references intact
 * (so any grep/wiring scan stays green) while silently re-opening an unbounded paid-vision path on
 * the single most expensive call in the pipeline. This suite closes that gap: each guard must both
 * (a) return its status and (b) NEVER reach the Anthropic fetch. The final case pins the route's
 * documented fail-open contract — an anonymous caller skips the userId-scoped guards and a failing
 * provider call fails OPEN to { passed: true } so validation never blocks an export.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The quota gate and the ceiling are the units under test — mock ONLY the two entry points we
// force to block, keeping every other spend-ceiling export real (the route imports several).
vi.mock("@/lib/entitlement", () => ({
  checkExportAllowed: vi.fn().mockResolvedValue({
    allowed: true,
    isPro: false,
    remaining: 4,
    limit: 5,
    used: 1,
  }),
}));
vi.mock("@/lib/spend-ceiling", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/spend-ceiling")>();
  return { ...actual, enforceGenerationCeiling: vi.fn(async () => null) };
});

import { _resetBuckets, PAID_RATE_LIMIT } from "@/lib/rate-limit";
import { checkExportAllowed } from "@/lib/entitlement";
import { enforceGenerationCeiling } from "@/lib/spend-ceiling";
import { POST as validate } from "@/app/api/validate/route";

/** A body that clears every pre-guard check (non-empty, under the H2 bound) so the request
 *  reaches the userId-scoped quota gate + ceiling — exactly where we observe the block. */
function validBody(userId?: string): unknown {
  return { userId, clips: [{ id: "c1" }, { id: "c2" }], plan: {} };
}
function req(body: unknown, ip: string): Request {
  return new Request("http://localhost/api/validate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("/api/validate honors its wallet-drain guards (H1 / P0 / H7)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetBuckets();
    vi.clearAllMocks();
    // Key present, so only the guards (not the no-key fail-open) can end the request early.
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    // Any reached Anthropic call is a LEAKED paid call — make it both observable and inert.
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch must not be called"));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("H1: a per-IP flood trips 429 before any paid call", async () => {
    // Empty body: the rate-limit guard runs before body parse + the key check, so the flood trips
    // 429 while every earlier call fail-opens at the empty-clips check — the fetch is never hit.
    const ip = "203.0.113.40";
    let last: Response | undefined;
    for (let i = 0; i < PAID_RATE_LIMIT.limit + 1; i++) {
      last = await validate(req({ plan: {} }, ip));
    }
    expect(last!.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("P0: an over-quota userId gets 402 and the paid call never fires", async () => {
    (checkExportAllowed as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      isPro: false,
      remaining: 0,
      limit: 5,
      reason: "monthly free limit reached",
    });
    const res = await validate(req(validBody("u1"), "203.0.113.41"));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgrade).toBe(true); // free user → prompted to upgrade
    expect(checkExportAllowed).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("H7: hitting the daily generation ceiling gets 429 and the paid call never fires", async () => {
    (enforceGenerationCeiling as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      Response.json(
        { error: "Daily generation limit reached. Please try again tomorrow." },
        { status: 429 },
      ),
    );
    const res = await validate(req(validBody("u1"), "203.0.113.42"));
    expect(res.status).toBe(429);
    expect(enforceGenerationCeiling).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("anonymous callers skip the userId-scoped guards and fail OPEN on a provider error", async () => {
    // No userId → the guards are skipped by design (their brake is the per-IP rate limiter). The
    // request reaches the paid fetch, which our spy rejects → the route's documented fail-open
    // contract returns { passed: true } so a validation outage never blocks an export.
    const res = await validate(req(validBody(undefined), "203.0.113.43"));
    expect(checkExportAllowed).not.toHaveBeenCalled();
    expect(enforceGenerationCeiling).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });
});
