/**
 * B6 resilience — every API route that makes a paid/slow external provider call MUST
 * declare an explicit `export const maxDuration` serverless budget. Without one the
 * Vercel function inherits the short platform default (~10-15s) and is killed
 * mid-call → the user sees a silent "request failed" and the export work is lost.
 *
 * This is a fleet-wide invariant (not a per-route assertion) so that a NEW paid route
 * which forgets a budget fails this test instead of silently timing out in production.
 * (Regression guard for the four outlier routes fixed alongside this test:
 * style-transfer, thumbnail, upscale, voice-clone.)
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

const API_DIR = path.resolve(__dirname, "..");

/**
 * Source markers that mean "this route makes a paid/slow external provider call".
 * Includes the indirect provider paths — `@/lib/kling` (a re-export shim over
 * atlascloud, used by the animate routes) and `@/actions/detect` (wraps the Anthropic
 * planner, used by plan/ios-plan) — so a route that reaches a provider through a
 * wrapper is still required to declare a budget, not just the direct importers.
 */
const PROVIDER_MARKERS = [
  "@/lib/atlascloud",
  "@/lib/kling",
  "@/lib/elevenlabs",
  "@/lib/ai-models",
  "@/actions/detect",
  "api.anthropic.com",
];

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

const providerRoutes = routeFiles.filter((f) => {
  const src = readFileSync(f, "utf8");
  return PROVIDER_MARKERS.some((m) => src.includes(m));
});

describe("B6 — paid provider routes declare a serverless budget", () => {
  it("discovers the provider routes to check (guards the discovery itself)", () => {
    // If this drops to a handful, the marker list or the tree moved — fail loud rather
    // than silently checking nothing.
    expect(providerRoutes.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of providerRoutes) {
    const rel = path.relative(API_DIR, file);
    it(`${rel} exports a positive maxDuration`, () => {
      const src = readFileSync(file, "utf8");
      const match = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
      expect(
        match,
        `${rel} calls a paid/slow provider but declares no \`export const maxDuration\` — ` +
          `it will be killed at the platform default in production (B6).`
      ).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThan(0);
    });
  }
});
