/**
 * Reliability guard — the email/KV I/O routes declare an explicit serverless budget.
 *
 * These routes are NOT covered by route-maxduration.test.ts (which scopes to *paid provider*
 * routes via import markers). They make no paid AI call, but they DO perform external I/O —
 * KV reads/writes and confirmation/welcome email sends (the email client carries its own 10s
 * timeout). Without an explicit `export const maxDuration` they inherit the short platform
 * default (~10-15s) and can be killed mid-flow — e.g. a waitlist signup persisted to KV with
 * no confirmation email sent, silently dead-ending the pre-launch funnel.
 *
 * This asserts each of them keeps an explicit budget so a future edit that drops it fails loud.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const API_DIR = path.resolve(__dirname, "..");

// Routes that do email/KV I/O but no paid-provider call.
const IO_ROUTES = [
  "waitlist/route.ts",
  "waitlist/confirm/route.ts",
  "growth/stats/route.ts",
];

describe("email/KV I/O routes declare a serverless budget", () => {
  for (const rel of IO_ROUTES) {
    it(`${rel} exports a positive maxDuration`, () => {
      const src = readFileSync(path.join(API_DIR, rel), "utf8");
      const match = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
      expect(
        match,
        `${rel} does email/KV I/O but declares no \`export const maxDuration\` — it can be ` +
          `killed at the platform default mid-flow (e.g. signup saved, email never sent).`,
      ).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThan(0);
    });
  }
});
