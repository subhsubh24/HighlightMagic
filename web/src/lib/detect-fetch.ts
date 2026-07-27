/**
 * HTTP fetch with retry + exponential backoff for rate limits (429) and overload (529).
 *
 * Extracted verbatim from `actions/detect.ts` — a `"use server"` module whose helpers are
 * otherwise untestable in place AND coverage-dark (vitest `coverage.include` is `src/lib/**`,
 * so `src/actions/**` is invisible to the thresholds). This is the reliability spine of the
 * detection pipeline: every paid Anthropic call (scoring / planning / validation) goes through
 * it, so a mishandled 429/529 or a dropped transient burns COGS and export success. Continues
 * the detect.ts extraction ladder (detect-json, detect-normalize, detect-planner-frames).
 *
 * The retry logic is byte-identical to the original; the only addition is an OPTIONAL `config`
 * override (defaulting to the production values below) so tests can inject tiny backoffs and
 * exercise the exhaustion/cap paths without real multi-second waits. Callers in detect.ts pass
 * no config, so production behaviour is unchanged.
 */

/** Retry config for 429/529 responses. */
export const MAX_RETRIES = 5;
export const INITIAL_BACKOFF_MS = 2000;
/** Cap Retry-After waits — staggered launches prevent most 429s now. */
export const MAX_RETRY_WAIT_MS = 15_000;

export interface RetryConfig {
  maxRetries: number;
  initialBackoffMs: number;
  maxRetryWaitMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: MAX_RETRIES,
  initialBackoffMs: INITIAL_BACKOFF_MS,
  maxRetryWaitMs: MAX_RETRY_WAIT_MS,
};

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs?: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<Response> {
  const { maxRetries, initialBackoffMs, maxRetryWaitMs } = config;
  const fetchStart = Date.now();
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const fetchInit = timeoutMs
        ? { ...init, signal: AbortSignal.timeout(timeoutMs) }
        : init;
      const attemptStart = Date.now();
      const response = await fetch(url, fetchInit);
      if (response.ok) {
        if (attempt > 0) {
          console.log(`${label}: succeeded on attempt ${attempt + 1} after ${((Date.now() - fetchStart) / 1000).toFixed(1)}s total`);
        }
        return response;
      }

      // Only retry on rate-limit (429) or overloaded (529)
      if (response.status === 429 || response.status === 529) {
        const retryAfter = response.headers.get("retry-after");
        const retryAfterSec = retryAfter ? parseFloat(retryAfter) : NaN;
        const rawWaitMs = !isNaN(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : initialBackoffMs * Math.pow(2, attempt);
        const waitMs = Math.min(rawWaitMs, maxRetryWaitMs);
        console.warn(`${label}: HTTP ${response.status} (${response.status === 429 ? "rate-limited" : "overloaded"}), attempt ${attempt + 1}/${maxRetries}, waiting ${Math.round(waitMs)}ms (elapsed ${((Date.now() - fetchStart) / 1000).toFixed(1)}s)`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // Non-retryable HTTP error — return as-is
      console.error(`${label}: non-retryable HTTP ${response.status} after ${((Date.now() - attemptStart) / 1000).toFixed(1)}s`);
      return response;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "network error";
      if (attempt < maxRetries) {
        const waitMs = initialBackoffMs * Math.pow(2, attempt);
        console.warn(`${label}: ${errMsg}, attempt ${attempt + 1}/${maxRetries}, waiting ${waitMs}ms (elapsed ${((Date.now() - fetchStart) / 1000).toFixed(1)}s)`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      console.error(`${label}: all ${maxRetries} retries exhausted after ${((Date.now() - fetchStart) / 1000).toFixed(1)}s — last error: ${errMsg}`);
      throw err;
    }
  }
  // All retries exhausted — make one final attempt (will throw on failure)
  console.warn(`${label}: retries exhausted, making final attempt (elapsed ${((Date.now() - fetchStart) / 1000).toFixed(1)}s)`);
  const fetchInit = timeoutMs
    ? { ...init, signal: AbortSignal.timeout(timeoutMs) }
    : init;
  return fetch(url, fetchInit);
}
