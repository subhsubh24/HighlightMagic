# PROPOSED CI — enforce the loop's quality gates as REQUIRED checks (owner applies)

> **✅ APPLIED 2026-06-28 (PR #164).** `web-e2e` added to `.github/workflows/ci.yml` and `web-lint`
> made blocking; both confirmed GREEN on the PR before requiring (web-e2e 1m22s, web-lint 21s).
> Branch-protection `required_status_checks` is now `["web", "ios", "web-e2e", "web-lint"]`; issue
> #163 closed. This doc is kept as the record of the staged plan. **Do not set `E2E_RATELIMIT_BYPASS`
> in Vercel/prod** — it is a CI-only, test-only rate-limit bypass.

**Why this is staged, not applied:** the autonomous loop must NOT edit `.github/` (it trips a
sensitive-file permission prompt that hangs a headless run). So the loop builds everything it can
(the functional journey suite, lint-at-zero, the test-only rate-limit bypass) and stages the CI
wiring HERE for a **workflow-scope human** to apply.

**The gap (loop-health harness proposal):** today the required checks are only `web`
(`npm ci && build && test` = Vitest unit) and `ios`. The **functional journey suite is not run in CI
at all**, and **lint is non-blocking** (`web-lint`). So a BUILDS≠WORKS regression (a flow that
compiles + unit-tests green but is broken/dead-ends for a real user) or a lint failure can still
auto-merge. This adds the functional-journey job and makes lint blocking.

---

## 1. Add this job to `.github/workflows/ci.yml` (alongside `web`, `web-lint`, `ios`)

```yaml
  web-e2e:
    name: web-e2e
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    env:
      # Gotcha (b): one CI runner replays the self-seeding journeys from a single IP and would trip
      # the per-IP rate limit. TEST-ONLY bypass, honored ONLY by checkRateLimit when this is "1".
      # PRODUCTION/Vercel MUST NEVER set this var (it is a security bypass) — it lives only here.
      E2E_RATELIMIT_BYPASS: "1"
      # No DB to migrate: this product's web/ has no SQL DB (only optional Vercel KV, which falls back
      # to in-memory when unset — leave KV_* unset in CI). No prod migration step needed.
      # Gotcha (a) — next-auth trusted-host (AUTH_TRUST_HOST/AUTH_URL): N/A here, HighlightMagic has no
      # web auth/login + no auth callback redirect. (Kept for cross-factory parity; do not add for HM.)
      # TURNSTILE_SECRET_KEY is intentionally UNSET so the CAPTCHA fails open and the waitlist runs keyless.
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
      - name: Install Playwright (chromium)
        run: npx --yes playwright install --with-deps chromium
      - name: Functional journey suite (build + start + drive real journeys)
        # `npm run test:e2e` = Playwright; its webServer runs `npm run build && next start` and the
        # suite replays the real journeys + asserts intended outcomes (BUILDS != WORKS).
        run: npm run test:e2e
```

The existing `web-lint` job already runs `npm run lint`; no change needed to it — it just needs to
become **required** (step 2). (Lint is at zero warnings; keep it that way — Reviewer A rejects new
warnings.)

## 2. Set branch-protection required status checks on `main`

Add the two new gates to the existing list so it becomes:

```
required_status_checks.contexts = ["web", "ios", "web-e2e", "web-lint (non-blocking)"]
```

(The `web-lint` job's display name is currently `web-lint (non-blocking)`; either keep that exact
string in the contexts list, or rename the job to `lint` and use that — match the names exactly or
the check will never be found.) `gh` example:

```bash
gh api -X PUT repos/subhsubh24/HighlightMagic/branches/main/protection/required_status_checks \
  -f strict=true -f 'contexts[]=web' -f 'contexts[]=ios' -f 'contexts[]=web-e2e' -f 'contexts[]=web-lint (non-blocking)'
```

## 3. VERIFY GREEN BEFORE MARKING REQUIRED (do not block the loop with a flaky/red check)
Apply the workflow first, open a throwaway PR, and confirm **`web-e2e` runs GREEN** (and `web-lint`
green) in CI. ONLY THEN add them to `required_status_checks`. A red/flaky required check would block
every auto-merge and stall the loop. Once both are green + required, **close the harness-proposal issue**.

## Notes
- Gotcha (b) bypass: `web/src/lib/rate-limit.ts` honors `E2E_RATELIMIT_BYPASS === "1"` (test-only).
  Recorded in PENDING_OPS — **never set it in the Vercel/prod environment.**
- iOS: `ios` is already required + green; native UI journeys (XCUITest/snapshot) run on the macOS
  runner and are tracked separately (ROADMAP A6/G6) — not part of this web-e2e gate.
