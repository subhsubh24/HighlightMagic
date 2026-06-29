/**
 * Sliding-window IP rate limiter — Track H1 (ROADMAP).
 *
 * In-memory per-serverless-instance (suitable for Vercel; each cold-start gets a fresh map).
 * Provides a per-IP throttle on paid/public endpoints to prevent brute-force API abuse.
 * For cross-instance enforcement, pair with a KV-backed atomic counter (same pattern as
 * kv-quota-store.ts); the in-memory version is correct within one instance and for tests.
 *
 * Preflight asserts: `grep -rqiE 'ratelimit|rate.?limit' web/src/app/api/score/route.ts web/src/lib`
 */

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix timestamp (seconds) when the window resets */
  resetAt: number;
}

// Sliding-window hit buckets, keyed by `${endpointTag}:${clientIdentifier}`
const buckets = new Map<string, number[]>();

/**
 * HARD-REFUSE the test-only bypass on the live platform.
 *
 * `E2E_RATELIMIT_BYPASS=1` disables per-IP throttling so the CI functional-journey suite (one runner,
 * one IP, self-seeding journeys) doesn't trip limits. That CI job runs on GitHub Actions, OFF Vercel,
 * where `VERCEL` is unset. On ANY Vercel deployment (production OR preview) the var must NEVER be set —
 * if it is, abuse + wallet-drain protection on a live, paid, public backend is silently off. So we FAIL
 * LOUD at module load (the route can't even boot) rather than serve traffic with rate limiting disabled.
 *
 * `VERCEL` is "1" on every Vercel build/runtime and unset in GitHub Actions / local dev — exactly the
 * signal that separates "live platform" from "CI/test". Exported + env-injectable so it's unit-testable.
 */
export function assertRateLimitBypassNotOnLivePlatform(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.E2E_RATELIMIT_BYPASS === "1" && env.VERCEL) {
    throw new Error(
      `SECURITY: E2E_RATELIMIT_BYPASS is set on a Vercel deployment (VERCEL=${env.VERCEL}). ` +
        "This is a TEST-ONLY rate-limit bypass for the CI journey suite and MUST NEVER be set in " +
        "production/preview — it disables abuse + wallet-drain protection. Remove it from the Vercel " +
        "environment immediately.",
    );
  }
}

// Enforced at module load: importing the limiter on a misconfigured live deployment fails the boot.
assertRateLimitBypassNotOnLivePlatform();

/**
 * Check and record a rate-limit hit. Returns whether the request is allowed.
 * @param key    Unique key (e.g. `score:1.2.3.4` or `waitlist:5.6.7.8`)
 * @param config Limit + window duration
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  // TEST-ONLY bypass for the CI functional-journey suite: one CI runner replays the self-seeding
  // journeys from a SINGLE IP and would trip this per-IP limit. Gated on an env var that PRODUCTION
  // MUST NEVER set — it is set ONLY in the CI e2e job. If E2E_RATELIMIT_BYPASS is ever present in a
  // prod/Vercel environment, that is a SECURITY misconfiguration (remove it immediately); never trust
  // this in real traffic. (Recorded in PENDING_OPS so the owner never sets it in prod.)
  if (process.env.E2E_RATELIMIT_BYPASS === "1") {
    return { allowed: true, limit: config.limit, remaining: config.limit, resetAt: Math.ceil((Date.now() + config.windowSec * 1000) / 1000) };
  }
  const now = Date.now();
  const windowMs = config.windowSec * 1000;
  // Keep only hits within the current window
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  const resetAt = Math.ceil((now + windowMs) / 1000);

  if (hits.length >= config.limit) {
    return { allowed: false, limit: config.limit, remaining: 0, resetAt };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, limit: config.limit, remaining: config.limit - hits.length, resetAt };
}

/**
 * Extract the real client IP from a Request object.
 * Checks x-forwarded-for (set by Vercel's edge), x-real-ip, then falls back to "unknown".
 */
export function getClientIP(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

// Standard rate-limit tiers
/** Paid AI endpoints (Anthropic/ElevenLabs/AtlasCloud) — 10 req/min/IP */
export const PAID_RATE_LIMIT: RateLimitConfig = { limit: 10, windowSec: 60 };
/** Public unauthenticated forms (waitlist) — 5 req/min/IP to resist bot floods */
export const PUBLIC_RATE_LIMIT: RateLimitConfig = { limit: 5, windowSec: 60 };
/**
 * Status/polling endpoints (e.g. /api/animate/check) — generous so legitimate polling never trips
 * (poll-manager waves run ~every 5s ≈ 12/min; even an aggressive 1s cadence stays at 60/min), while
 * still bounding job-ID enumeration / DoS amplification at 60 req/min/IP. Do NOT use PAID_RATE_LIMIT
 * (10/min) here — it would reject normal polling and dead-end an in-flight photo-animation job.
 */
export const POLL_RATE_LIMIT: RateLimitConfig = { limit: 60, windowSec: 60 };

/** Build a standard 429 Too Many Requests response with Retry-After headers. */
export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfter = Math.max(1, result.resetAt - Math.floor(Date.now() / 1000));
  return Response.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.resetAt),
        "Retry-After": String(retryAfter),
      },
    },
  );
}

/** Reset all rate-limit buckets. For tests only. */
export function _resetBuckets(): void {
  buckets.clear();
}
