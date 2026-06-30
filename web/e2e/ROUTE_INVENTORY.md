# Route / flow inventory — web functional coverage (BUILDS ≠ WORKS)

Provable coverage map for the runtime journey suite (`web/e2e/journeys.spec.ts`, run via
`npm run test:e2e`). Every browser-reachable route + critical flow is listed with the spec that
covers it and the **intended outcome** it asserts (never `status<400` alone). Keep this in sync as
routes/flows change — a route here with no outcome-asserting test is treated as BROKEN.

Stack note (this product): `web/` is a Next.js app — a web editor (`/`) + a marketing/waitlist
landing (`/landing`) + an API backend. There is **no Postgres/migration chain and no web
account-signup/login** (only optional Vercel KV for quota). The product's "signup" on web is the
**waitlist email capture**; real user accounts + the full capture→detect→export journey live in the
**iOS app** (covered by XCUITest/XCTest, not this browser suite — see "Not browser-testable").

## Browser routes (pages)

| Route | Flow | Spec | Outcome asserted |
|---|---|---|---|
| `/` | App editor main screen | journeys.spec.ts | Upload hero `Drop your footage.` heading renders; error boundary absent |
| `/landing` | Marketing + waitlist | journeys.spec.ts | Real `<h1>` hero + working `email` input visible; error boundary absent |
| `/landing` | **Waitlist signup (the web "signup")** | journeys.spec.ts | Submit a unique email via the real form → success state `You're on the list!` renders |
| `/privacy` | Legal | journeys.spec.ts | Heading renders, not 404/boundary |
| `/terms` | Legal | journeys.spec.ts | Heading renders, not 404/boundary |
| `/support` | Support/FAQ | journeys.spec.ts | Heading renders, not 404/boundary |
| `/offline` | PWA offline fallback | journeys.spec.ts | Heading renders, not 404/boundary |

Auth note: there are **no protected/authed web routes** (no web login), so there is no
logged-out-bounce journey to assert on web. If web auth is ever added (PENDING_OPS: server-quota-infra
/ ROADMAP B3 — Clerk or Supabase), add an authed journey here: `web/e2e/authed-journeys.spec.ts` that
signs in through the real UI against an EPHEMERAL auth backend and asserts the post-login screen
renders real content (never an error boundary). It auto-runs in the REQUIRED `web-e2e` check
(playwright testDir=e2e). The **authed-journey tripwire** (`web/src/lib/authed-journey-guard.test.ts`,
in the required `web` check) FAILS the build the moment web auth is introduced without that spec — its
header carries the full fix (ephemeral-backend seeding, evidence-based debugging, and the CSP
`connect-src` local-origin fix that was the AptDesignerAI root cause).

## Next gaps (add as the product grows)
- Web editor deeper flow (`/`): upload → detect → editor → export is currently stubbed/mocked on web
  and exercised primarily in iOS; add outcome-asserting coverage for any web export path that ships.
- Paywall → checkout (TEST MODE) → entitlement unlock: no web checkout exists (StoreKit is iOS); add
  here only if a web purchase path ships.
- a11y / visual / perf gates (Track G4) layer onto this suite next.

## Not browser-testable here → human / other-suite coverage
- iOS app journeys (capture → detect → edit → 1080×1920 export → share; StoreKit paywall →
  purchase → Pro unlock): XCUITest/XCTest + the macOS `ios` CI job; device-only gaps in PENDING_OPS.
- Real (non-sandbox) **payment capture**, **email deliverability**, native/device **store
  purchases**, **push delivery**: MANUAL-ONLY — see PENDING_OPS.md "Functional reality" checklist.
