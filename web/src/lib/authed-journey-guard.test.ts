import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * AUTHED-JOURNEY TRIPWIRE (runs in the REQUIRED `web` check) — closes the BUILDS≠WORKS hole for the
 * logged-in product BEFORE it can open.
 *
 * HighlightMagic's web product currently has NO authenticated experience: the "signup" is the
 * waitlist (email capture), the paywall→checkout is StoreKit IN THE iOS APP, and middleware.ts is the
 * pre-launch site gate — not user auth. So there is no authed tier to run yet (the directive's "skip
 * if no auth" case). But web auth is a PLANNED capability (PENDING_OPS: server-quota-infra / ROADMAP
 * B3 — "add Clerk or Supabase" for authoritative server-side quota).
 *
 * This guard FAILS CLOSED the moment web auth is introduced WITHOUT an authed Playwright journey:
 * the loop cannot merge a login/dashboard/account flow that isn't actually RUN against a real auth
 * backend in CI. Because playwright's testDir is `e2e/`, any `e2e/*.spec.ts` auto-runs in the already
 * REQUIRED `web-e2e` check — so requiring the authed spec to EXIST is enough to enforce the tier.
 *
 * When this trips, the fix (mirrors the AptDesignerAI fix — debug from EVIDENCE, not guesses):
 *   1. Stand up a real EPHEMERAL auth backend in the journeys CI job (e.g. `supabase start` + db reset,
 *      or your stack's local auth), seed a CONFIRMED user via the admin/service path, then sign in
 *      through the REAL UI and assert the post-login screen renders real content (never an error
 *      boundary). No prod secrets — use the local backend + dummy non-empty values for unrelated keys.
 *   2. In the authed spec, attach `page.on("console")` + `page.on("pageerror")` and, on failure, read
 *      the login form's rendered error text and throw with BOTH — one CI run then names the exact
 *      cause instead of a blind toHaveURL timeout.
 *   3. MOST LIKELY ROOT CAUSE: the CSP `connect-src` (in middleware.ts / headers) only allows the
 *      PRODUCTION backend origin, so the browser's auth fetch to the LOCAL backend is CSP-blocked →
 *      "Failed to fetch" → silent sign-in failure. Fix = derive the allowed origin from the configured
 *      backend env var and append it to connect-src (+ img-src if you load backend images):
 *        let backendOrigin = "";
 *        try { if (process.env.NEXT_PUBLIC_SUPABASE_URL) backendOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin; } catch {}
 *      so local (CI) and prod both work and prod stays unchanged.
 *   4. Prove the authed journeys GREEN on a real PR FIRST; they then ride the existing required
 *      `web-e2e` check (testDir=e2e). Merge via `gh pr merge --squash --auto` — never --admin.
 */

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..");
const E2E_DIR = path.join(WEB_ROOT, "e2e");

// Signals that a real web auth/login experience has been introduced.
const AUTH_DEP = /(@clerk\/|@supabase\/|next-auth|"lucia"|@auth\/|@auth0\/|@workos-inc\/|firebase-auth|"@firebase\/auth")/;
const AUTH_ENV =
  /process\.env\.(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY)|(NEXT_PUBLIC_)?CLERK_[A-Z0-9_]+|NEXTAUTH_[A-Z0-9_]+|AUTH_SECRET|AUTH_URL|SESSION_SECRET)\b/;

function runtimeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { continue; }
    if (isDir) {
      if (["node_modules", "__tests__", "__screenshots__", "evals"].includes(entry)) continue;
      runtimeFiles(full, acc);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry) && !/\.(test|spec)\.[tj]sx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function webAuthIntroduced(): { introduced: boolean; signal: string } {
  const pkg = readFileSync(path.join(WEB_ROOT, "package.json"), "utf8");
  const depMatch = pkg.match(AUTH_DEP);
  if (depMatch) return { introduced: true, signal: `auth dependency in web/package.json: ${depMatch[0]}` };
  for (const f of runtimeFiles(path.join(WEB_ROOT, "src"))) {
    const m = readFileSync(f, "utf8").match(AUTH_ENV);
    if (m) return { introduced: true, signal: `auth env var ${m[1]} read in ${path.relative(REPO_ROOT, f)}` };
  }
  return { introduced: false, signal: "" };
}

function hasAuthedJourneySpec(): boolean {
  if (!existsSync(E2E_DIR)) return false;
  return readdirSync(E2E_DIR).some(
    (f) => /\.spec\.[tj]sx?$/.test(f) && /auth|login|signin|sign-in|account|dashboard/i.test(f),
  );
}

describe("authed-journey tripwire", () => {
  it("if web auth is introduced, an authed Playwright journey MUST exist (runs in the required web-e2e)", () => {
    const { introduced, signal } = webAuthIntroduced();
    if (!introduced) {
      // No web auth today → nothing to enforce (the directive's documented skip case).
      expect(introduced).toBe(false);
      return;
    }
    const ok = hasAuthedJourneySpec();
    if (!ok) {
      throw new Error(
        `Web auth was introduced (${signal}) but there is NO authed Playwright journey in web/e2e/.\n` +
          "BUILDS ≠ WORKS: the logged-in product must RUN in CI. Add web/e2e/authed-journeys.spec.ts\n" +
          "that signs in through the real UI against an EPHEMERAL auth backend and asserts the\n" +
          "post-login screen renders real content (never an error boundary). It auto-runs in the\n" +
          "required `web-e2e` check (playwright testDir=e2e). See this file's header for the full fix\n" +
          "(ephemeral backend seeding, evidence-based debugging, and the CSP connect-src local-origin fix).",
      );
    }
    expect(ok).toBe(true);
  });
});
