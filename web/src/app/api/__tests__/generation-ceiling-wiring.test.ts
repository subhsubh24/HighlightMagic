/**
 * Track H7 — every API route that makes a paid/expensive external provider call MUST be
 * wired to a per-user spend ceiling BEFORE the provider call. Two independent caps exist:
 *   - enforceGenerationCeiling()  (lib/spend-ceiling.ts) — the per-user DAILY_GENERATION_CAP
 *     on individual generation sub-calls (validate/intro/sfx/voiceover/animate/...).
 *   - checkDailySpendCeiling()    (lib/spend-ceiling.ts) — the per-user DAILY_EXPORT_CAP on the
 *     quota-consuming entry points (/api/score, /api/ios-score).
 *
 * The ceiling functions are unit-tested in isolation (spend-ceiling.test.ts), but nothing
 * asserted they are actually WIRED into the routes. A refactor that drops the guard from a
 * route — or a NEW paid route added without one — would silently re-open an unbounded
 * wallet-drain path with no failing test. This fleet-wide invariant closes that gap: it
 * discovers every provider route and requires each to call one of the two ceilings, with a
 * small, explicitly-justified allowlist for the routes that intentionally use a different
 * control.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

const API_DIR = path.resolve(__dirname, "..");

/** Source markers that mean "this route makes a paid/slow external provider call". */
const PROVIDER_MARKERS = [
  "@/lib/atlascloud",
  "@/lib/elevenlabs",
  "@/lib/ai-models",
  "api.anthropic.com",
  "@/lib/kling",
  "@/actions/detect",
];

/**
 * Provider routes that intentionally do NOT carry a per-user generation/export ceiling, with
 * the reason. Keep this list MINIMAL and justified — adding a route here is a deliberate
 * security decision, not a way to silence the test.
 */
const CEILING_EXEMPT: Record<string, string> = {
  // Status-poll endpoint: no userId, no new generation — it reads an already-submitted job.
  // Bounded instead by its own POLL_RATE_LIMIT (60/min/IP) — see animate/check/route.ts (#189).
  "animate/check/route.ts": "poll-only status read; rate-limited, starts no new paid work",
  // Stem separation runs without a userId; bounded by the per-IP PAID_RATE_LIMIT only (by design).
  "stems/route.ts": "no userId available; per-IP rate limit is the authoritative bound",
};

/** Recursively collect every route.ts under the api tree. */
function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...collectRouteFiles(full));
    } else if (entry.name === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

const routeFiles = collectRouteFiles(API_DIR);
const providerRoutes = routeFiles.filter((f) =>
  PROVIDER_MARKERS.some((m) => readFileSync(f, "utf8").includes(m)),
);

describe("H7 — paid provider routes are wired to a per-user spend ceiling", () => {
  it("discovers the provider routes to check (guards the discovery itself)", () => {
    // If this collapses, the marker list or the api tree moved — fail loud rather than
    // silently asserting nothing.
    expect(providerRoutes.length).toBeGreaterThanOrEqual(15);
  });

  for (const file of providerRoutes) {
    const rel = path.relative(API_DIR, file).split(path.sep).join("/");
    const exemptReason = CEILING_EXEMPT[rel];

    if (exemptReason) {
      it(`${rel} is intentionally ceiling-exempt (${exemptReason})`, () => {
        const src = readFileSync(file, "utf8");
        // An exempt route must NOT silently start carrying a userId-based ceiling without us
        // re-evaluating the exemption; if it does, drop it from CEILING_EXEMPT.
        const hasCeiling =
          src.includes("enforceGenerationCeiling") || src.includes("checkDailySpendCeiling");
        expect(
          hasCeiling,
          `${rel} now calls a per-user ceiling — remove it from CEILING_EXEMPT so it is checked normally.`,
        ).toBe(false);
      });
      continue;
    }

    it(`${rel} enforces a per-user spend ceiling before the paid call`, () => {
      const src = readFileSync(file, "utf8");
      const hasGenerationCeiling = src.includes("enforceGenerationCeiling(");
      const hasExportCeiling = src.includes("checkDailySpendCeiling(");
      expect(
        hasGenerationCeiling || hasExportCeiling,
        `${rel} makes a paid provider call but calls neither enforceGenerationCeiling() nor ` +
          `checkDailySpendCeiling() — an unbounded wallet-drain path (Track H7). Add the ceiling ` +
          `guard, or (only if genuinely justified) add it to CEILING_EXEMPT with a reason.`,
      ).toBe(true);
    });
  }
});
