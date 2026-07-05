# Pending Operations — Human-Required Steps

Items the factory cannot perform (signing, live keys, store setup, publishing).
The owner must apply these before shipping to the App Store.

The factory dashboard reads the fenced OWNER_ACTIONS block below (same cross-project shape as
AptDesignerAI / GroceryManager). Keep it valid, parseable YAML; the prose sections that follow are
the detailed how-to for each item.

```yaml
OWNER_ACTIONS:
  project: HighlightMagic
  as_of: 2026-07-05
  items:
    - id: review-outreach-drafts
      title: "Review + send 1 strategic outreach draft (Gmail — Sam Gutelle, Tubefilter)"
      priority: normal
      status: open
      why: "Growth Agent created a pre-launch pitch email for Sam Gutelle (Senior Editor, Tubefilter, creator economy press) as a Gmail DRAFT for owner to review + send. The agent never sends; the owner sends after reviewing."
      how: "Search Gmail drafts for 'Highlight Magic (iOS, pre-launch) — AI auto-editing for TikTok/Reels creators'. BEFORE SENDING: (1) replace [Your Full Name] placeholder, (2) add your business mailing address (CAN-SPAM legal requirement), (3) add one specific Tubefilter article reference for personalization, (4) verify sam@tubefilter.com is current. See draft body for full instructions."
      blocks: press-outreach
    - id: spend-caps
      title: Set HARD daily API spend caps + alerts in every provider dashboard
      priority: urgent
      status: done
      done_on: 2026-07-02
      verification: owner-attested (provider-dashboard setting — cannot be verified from the repo). Owner confirmed caps set 2026-07-02.
      why: The backend is live on Vercel and calls paid APIs (Anthropic, ElevenLabs, AtlasCloud); a single export fires multiple expensive calls, so an abuse spike or runaway loop can run up cost. A spend cap is the only hard backstop a code-level ceiling cannot replace.
      how: "DONE (owner-attested 2026-07-02): hard daily/monthly caps + alerts set in console.anthropic.com, elevenlabs.io billing, and the AtlasCloud dashboard. This is the hard backstop for unattended real-eval + live-backend spend — it satisfies prerequisite (b) for video-gen eval going weekly (see ROADMAP G3 COST GOVERNANCE); the remaining prereq (a) is the in-code per-run cost ceiling, built with the video-gen eval. If any key is ever suspected exposed, regenerate it."
      blocks: launch-safety
    - id: gtm-connect-email
      title: "Connect Resend (email) so the Growth Agent can run the transactional + lifecycle email loop"
      priority: high
      status: open
      why: "RESEND_API_KEY is unset, so web/src/lib/email/ stays in dry-run — no confirmation, welcome, or lifecycle email fires. Reconciles GROWTH_STATUS validation.sources[email] (unavailable)."
      how: "Per docs/growth/CONNECT.md Step 1 (~5 min, free tier, no credit card): create a Resend account, verify the highlightmagic.app domain, create an API key, set RESEND_API_KEY in Vercel env, redeploy."
      blocks: growth-execution
    - id: gtm-connect-datastore
      title: "Provision Vercel KV so waitlist signups persist and the Growth Agent can pull real numbers"
      priority: high
      status: open
      why: "KV_REST_API_URL / KV_REST_API_TOKEN are unset — signups exist only in ~7-day Vercel function logs, and /api/growth/stats has nothing durable to read. Reconciles GROWTH_STATUS validation.sources[datastore] (unavailable)."
      how: "Per docs/growth/CONNECT.md Step 3: Vercel dashboard -> Storage -> Create Database -> KV, name it, redeploy (Vercel auto-sets the env vars)."
      blocks: growth-execution
    - id: gtm-connect-analytics
      title: "Create the plausible.io account for highlightmagic.app + set GROWTH_AGENT_SECRET"
      priority: high
      status: open
      why: "CODE HALF DONE (#360, 2026-07-05): web/src/app/layout.tsx now renders the nonce'd Plausible <script> on the production host. What remains is purely an owner step — the plausible.io account itself doesn't exist yet, so the script has nowhere to report to; separately GROWTH_AGENT_SECRET is still unset so /api/growth/stats (E6d) returns 503. Reconciles GROWTH_STATUS validation.sources[in_app_analytics, analytics_pull_api] (both unavailable)."
      how: "(1) Create a free/paid plausible.io account for the highlightmagic.app site — no further code change needed, the script is already wired. (2) Set GROWTH_AGENT_SECRET in Vercel to any random 32-char string per CONNECT.md Step 3. Note: even after both are done, the Growth Agent's stats pull (getGrowthMetrics) reads only the KV waitlist store today, not Plausible — visitor counts will still need a future read-path addition to reach GROWTH_STATUS.funnel.visitors_7d."
      blocks: growth-execution
    - id: gtm-connect-social
      title: "Connect at least one social channel (X / Instagram / TikTok / Reddit) API credentials"
      priority: normal
      status: open
      why: "The publishing queue (web/src/lib/social/queue.ts) is built and dry-run-safe but refuses to post without a channel's API key/OAuth token. Reconciles GROWTH_STATUS validation.sources[social_x, social_instagram, social_tiktok, social_reddit] (all unavailable)."
      how: "Set one of X_API_BEARER_TOKEN, INSTAGRAM_ACCESS_TOKEN, TIKTOK_ACCESS_TOKEN, or REDDIT_ACCESS_TOKEN in Vercel env per the platform's developer portal. Start with whichever platform the owner already has an account on."
      blocks: growth-execution
    - id: site-gate
      title: "Set SITE_GATE_PASSWORD pre-launch (password-protect the unfinished web app); UNSET at launch"
      priority: high
      status: open
      why: "Pre-launch, the public must NOT reach the half-baked web app. The gate (ROADMAP D6, web/src/middleware.ts) is ON only when SITE_GATE_PASSWORD is set; the waitlist/landing/legal + /api/* stay open so people can still join the waitlist. EXECUTE-mode marketing is BLOCKED until the gate is up (GROWTH_STATUS.site_gate_up: true)."
      how: "In Vercel env for web/, set SITE_GATE_PASSWORD=deepster (never commit the value), then flip GROWTH_STATUS.site_gate_up to true. At launch (every ship-critical QUALITY_SCORECARD dim A/A+ + readiness passed), UNSET SITE_GATE_PASSWORD to open the app."
      blocks: launch-exposure
    - id: enforce-ci-gates
      title: "Apply docs/ci/PROPOSED_CI.md — add the web-e2e job + make web-e2e/web-lint REQUIRED checks"
      priority: high
      status: done
      done_on: 2026-06-28
      why: "The functional journey suite + lint are not enforced in CI, so a BUILDS!=WORKS or lint-failing change can still auto-merge. The loop can't edit .github/, so it staged the workflow + required-checks list."
      how: "DONE (PR #164): added the web-e2e job to .github/workflows/ci.yml + made web-lint blocking; confirmed both GREEN on the PR (web-e2e 1m22s, web-lint 21s); set branch-protection required_status_checks = [web, ios, web-e2e, web-lint]; closed #163. REMINDER: NEVER set E2E_RATELIMIT_BYPASS in the Vercel/prod env (it's a test-only rate-limit bypass — CI job only)."
      blocks: ci-gate-enforcement
    - id: vercel-env-keys
      title: Set the three backend API keys as Vercel environment variables
      priority: high
      status: open
      why: All paid AI calls are routed server-side through web/; without these keys every detection/generation path fails.
      how: In the Vercel dashboard for the web/ deployment set ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, and ATLASCLOUD_API_KEY (server-side only, never in the iOS app).
      blocks: backend-functionality
    # VALIDATION CAPABILITIES (ROADMAP G6) — unmet capabilities the loop cannot self-validate without
    # an owner-funded key. Each is mirrored in LOOP_HEALTH validation.unmet (must be in BOTH places).
    # All three secrets are set on the SAME screen (GitHub → Settings → Secrets and variables →
    # Actions) and consumed by .github/workflows/live-eval.yml (weekly + manual; NOT per-PR). Use
    # SEPARATE low-budget keys with HARD provider caps (see spend-caps). DISTINCT from the Vercel
    # runtime keys (vercel-env-keys): GitHub secrets = CI validation; Vercel env = the live app.
    - id: validation-capability-anthropic
      title: "Set ANTHROPIC_API_KEY as a GitHub Actions secret so the loop validates the REAL detection round-trip"
      priority: urgent
      status: done
      done_on: 2026-07-01   # owner set the GH secret; the REAL detect eval ran GREEN 4/4 (~$0.07/fixture) — detection/planning is now real-validated
      why: "Anthropic frame-scoring + edit-planning is the detection CORE. Until the key is a GH secret it's only mock-validated; the detect eval (web/src/evals/detect.eval.ts) skips + warns, so 'detection works' is unproven and the capability cannot be ticked done."
      how: "GitHub → Settings → Secrets and variables → Actions → add ANTHROPIC_API_KEY (separate low-budget, HARD-capped key). Enables the detect eval in live-eval.yml now. NEVER commit a key value."
      blocks: live-round-trip-validation
    - id: validation-capability-elevenlabs
      title: "Set ELEVENLABS_API_KEY as a GitHub Actions secret so the loop validates the REAL voiceover round-trip"
      priority: urgent
      status: done
      done_on: 2026-07-01   # owner set the GH secret (owner part COMPLETE). Real validation now awaits the TTS eval being BUILT (ROADMAP G3 rung 4) — loop work, not owner.
      why: "ElevenLabs TTS (voiceover) is a paid capability validated only with a real key. Until set, it stays mock-validated and cannot be ticked done."
      how: "GitHub → Settings → Secrets and variables → Actions → add ELEVENLABS_API_KEY (separate low-budget, HARD-capped key). Activates once the TTS eval lands (ROADMAP G3). NEVER commit a key value."
      blocks: live-round-trip-validation
    - id: validation-capability-atlascloud
      title: "Set ATLASCLOUD_API_KEY as a GitHub Actions secret so the loop validates the REAL video-generation round-trip"
      priority: urgent
      status: done
      done_on: 2026-07-01   # owner set the GH secret (owner part COMPLETE). Real validation now awaits the video-gen eval being BUILT (ROADMAP G3 rung 6) — loop work, not owner.
      why: "AtlasCloud/Kling video generation is the most expensive paid call and is validated only with a real key. Until set, it stays mock-validated and cannot be ticked done."
      how: "GitHub → Settings → Secrets and variables → Actions → add ATLASCLOUD_API_KEY (separate low-budget, HARD-capped key). Activates once the video-gen eval lands (ROADMAP G3). NEVER commit a key value."
      blocks: live-round-trip-validation
    - id: server-quota-infra
      title: Provision the auth layer + Vercel KV for authoritative server-side quota (B3)
      priority: high
      status: open
      why: Free-tier enforcement is currently client-side in the iOS app and can be bypassed by reinstalling; the server must derive userId from a verified session, not a caller-supplied flag.
      how: Add an auth provider (Clerk or Supabase) + Vercel KV (KV_REST_API_URL / KV_REST_API_TOKEN), then wire the quota check/increment routes to the verified session. See the B3 section below.
      note: "As of #232 (Run 36) the per-user DAILY spend ceiling (Track H7) also uses this same Vercel KV for CROSS-INSTANCE enforcement (atomic INCR per UTC-day key). Until KV is provisioned it falls back to an in-memory per-instance counter — correct on one instance but multiplied across Vercel's fan-out. Provisioning KV closes both the monthly quota AND the daily-ceiling cross-instance gaps at once."
      blocks: server-side-quota
    - id: storekit-products
      title: Create live StoreKit products + configure iOS signing in App Store Connect
      priority: normal
      status: open
      why: Pro entitlement and revenue depend on real subscription products and a signed build.
      how: Create pro.monthly and pro.yearly subscriptions in App Store Connect, set up the distribution certificate/provisioning profile, and set DEVELOPMENT_TEAM. See the StoreKit / signing sections below.
      blocks: revenue
    - id: bundle-music-assets
      title: "Bundle licensed royalty-free music tracks (the in-app music picker is non-functional without them)"
      priority: normal
      status: open
      why: "The iOS music picker + 14-track MusicLibrary reference audio fileNames, but NO audio files are committed anywhere in the repo (confirmed Run 34 DEEP AUDIT), so MusicTrack.bundleURL is always nil: exports get no music and beat-sync falls back to a synthetic grid (build-but-broken). Marketing was corrected (Run 34, #223/#224/#225) to stop claiming music until this is fixed."
      how: "Add licensed royalty-free .mp3 files whose names match MusicLibrary.tracks fileName values (summer_vibes, golden_hour, peak_moment, happy_days, power_up + the 9 premium tracks) to the app bundle (SPM Sources/Resources or an Xcode resource group). Alternatively tell the loop to hide the music picker until assets exist. See REMAINING_STEPS 0d.3."
      blocks: music-feature
```

## ✅ Spend caps — DONE (owner-attested 2026-07-02)
Hard daily/monthly spend caps + 50%-of-cap alerts are set in console.anthropic.com, elevenlabs.io
billing, and the AtlasCloud dashboard (see the `spend-caps` item in OWNER_ACTIONS above). This was
the hard backstop against an unthrottled/abused public endpoint racking up cost via a single
export's multiple expensive generation calls. If any key is ever suspected exposed, regenerate it
immediately and note it here.

## Backend API Keys (Vercel Environment Variables)

Set these in the Vercel dashboard for the `web/` deployment:

| Variable | Purpose | Required for |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude frame scoring + tape planning + validation | All AI detection/generation |
| `ELEVENLABS_API_KEY` | Music, SFX, voiceover, voice clone generation | Audio features |
| `ATLASCLOUD_API_KEY` | Photo animation (Kling), video generation (Wan), upscale | Photo animation + intro/outro |

## Server-Side Quota (B3 — BLOCKED: requires auth layer first)

Free tier enforcement (5 exports/user/month) is currently CLIENT-SIDE ONLY in the iOS app
(`AppState.exportsUsedThisMonth` in UserDefaults). This can be bypassed by reinstalling the
app or modifying client state.

To enforce server-side, two infrastructure prerequisites must be added first:

### Prerequisite 1 — Auth layer (owner decision required)

Without a server-verified identity, any HTTP client can pass `{ "isProUser": true }` in the
request body to bypass the quota limit entirely. The `userId` must come from a verified
session token, not the caller-supplied request body.

Add an auth provider before implementing quota routes:
- **Clerk** (recommended for Next.js): `npm install @clerk/nextjs`; wrap route handlers with `auth()`
- **Supabase Auth**: provides JWT + optional row-level security

Once auth is added, the `quota.ts` library and tests from the closed PR #29 branch
(`claude/b3-quota-api`) can be restored and the route handlers updated to derive `userId`
from the verified session.

### Prerequisite 2 — Vercel KV
1. Add **Vercel KV** (Redis) to the Vercel project (Storage tab in Vercel dashboard)
2. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars (Vercel provides these automatically)

### Implementation steps (after both prerequisites are met)
3. Restore `/api/quota/check` and `/api/quota/increment` from PR #29 branch, updated to
   derive `userId` from the auth session (e.g. `auth().userId`) instead of the request body
   Key pattern: `quota:{userId}:{YYYY-MM}`, TTL: 31 days
4. Call `quota/check` at the start of the detection pipeline; call `quota/increment` on
   successful export; return HTTP 402 if limit is exceeded for free users

## P0 — API keys + entitlement (BUSINESS-PAID model, owner-decided 2026-06-25)

CORRECTION: the prior "BYOK confirmed" note here was wrong. The model is BUSINESS-PAID — the
business holds all API keys server-side and pays the bills. The factory must REMOVE the iOS
embedded/Keychain key path and route all paid calls through `web/`, with server-side quota +
Pro-entitlement enforcement before any paid call.

Owner-only actions (the factory cannot do these):
- Set live `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ATLASCLOUD_API_KEY` in Vercel env (server-side only).
- Provision the server-side quota/identity store (e.g. Vercel KV) the factory wires up.
- Set up App Store Server API credentials (key ID / issuer ID / .p8) for server-side
  receipt/transaction verification of Pro entitlement.
- Set the Anthropic Console hard spend cap (cost backstop).

## iOS App Signing & Provisioning

1. Apple Developer account with an active membership
2. App ID: `com.highlightmagic.app` registered in the portal
3. Distribution certificate + provisioning profile in Xcode
4. `DEVELOPMENT_TEAM` in project.pbxproj updated from `REPLACE_WITH_YOUR_TEAM_ID`

## iOS Release Build — app target + archive (the SwiftPM-library gap) — BLOCKS submission

The iOS code currently builds as a SwiftPM **.library** (compiles + unit-tests green in CI = ROADMAP
A1) but has **NO archivable app target / `.xcodeproj` / shared scheme**, so it CANNOT yet be archived
or uploaded to the App Store. "CI green" is NOT "store-binary-ready" (BUILDS ≠ WORKS). On a Mac with
Xcode (the loop runs on Linux and cannot author/verify this):
1. Create/confirm an Xcode **app target** (or `.xcodeproj`/workspace) wrapping `Sources/` with a
   SHARED, ARCHIVABLE scheme; set `DEVELOPMENT_TEAM`, bundle id `com.highlightmagic.app`, marketing
   version + build number; bind `Sources/Info.plist` + `HighlightMagic.entitlements` + the AppIcon.
2. Validate WITHOUT a signed build: `xcodebuild -scheme HighlightMagic -showBuildSettings` resolves
   and the scheme ARCHIVES (signing aside).
3. Archive → export via `ExportOptions.plist` (or fastlane gym/deliver) → upload to App Store Connect
   → TestFlight → submit + respond to review.
These signed steps are HUMAN-ONLY; the loop never touches signing/secrets or `.github/`. (Tracked as
ROADMAP A6 + D5; the loop stages only what it can verify on Linux.)

## StoreKit Live Products

Create in App Store Connect → Subscriptions:
- Product ID: `pro.monthly` (matches `SubscriptionProduct.monthly.rawValue`)
- Product ID: `pro.yearly` (matches `SubscriptionProduct.yearly.rawValue`)

Enable StoreKit configuration in Xcode for development testing.

## iOS CI (A1)

A1 is substantially done — SwiftPM test target added in #15 and the xcodeproj was removed.
The `ios` CI job is NON-BLOCKING. PR #16 (`claude/a1-ci-destination`) attempted a destination
fix but is broken (edits .github/ BLAST RADIUS + Swift syntax bug) — **close this PR without
merging**. If the `ios` CI job fails on future PRs, diagnose the runner failure separately.

## App Store Assets

- App icon: present (`Sources/Resources/`) — verify correct sizes for all slots
- Screenshots: 6.7" and 6.1" iPhone screenshots needed (min 3 each)
- App preview video: optional but recommended for a video editing app
- Support URL: set to `https://highlightmagic.app/support` (or similar)
- Privacy policy URL: set to `https://highlightmagic.app/privacy` (page exists in web/)

## App Privacy Labels (App Store Connect)

Set App Privacy labels to match the privacy policy:
- **Data Not Collected** — no names, emails, addresses, contacts
- **Data Not Linked to You** — anonymous ID used only for export count (not linked to identity)
- **Data Used to Track You** — none (no advertising)
- Third-party SDK disclosure: Anthropic, ElevenLabs, AtlasCloud (server-side only — may not
  require label if processing is server-side; verify with Apple's guidelines)

## Privacy Contact

Set up `privacy@highlightmagic.app` email to respond to privacy requests.

## PrivacyInfo.xcprivacy

`Sources/Resources/PrivacyInfo.xcprivacy` EXISTS and contains:
- `NSPrivacyAccessedAPICategoryUserDefaults` (CA92.1)
- `NSPrivacyAccessedAPICategoryFileTimestamp` (C617.1)

No action needed on PrivacyInfo.xcprivacy. Verify App Privacy labels in App Store Connect
match what the privacy policy discloses.

## Waitlist double-opt-in — DECISION (no gate on an unbuilt loop)

**Decision (2026-06-28):** the waitlist double-opt-in confirmation is gated on the email loop being
WIRED. With **no provider** (dry-run / pre-launch) the signup is recorded **confirmed directly** —
no "check your email" step that could never complete (a gate on an unbuilt loop). When an email
provider IS configured, the flow uses real double-opt-in (pending → confirmation email → confirm).
- **Owner action:** when you connect Resend (per `docs/growth/CONNECT.md`), **run the G7 email
  round-trip test** (receive the real confirmation email → follow the link → confirmed) BEFORE relying
  on double-opt-in. Until that round-trip passes, the email-confirmed path is UNVALIDATED.

## Marketing / Web

- **Waitlist email provider**: `/api/waitlist` (PR #42) logs emails to Vercel function logs.
  Connect a real provider (Resend recommended) before launch — see REMAINING_STEPS.md §2.
- **Landing page URL**: available at `/landing` on the Vercel deployment. Consider redirecting
  `/` → `/landing` and the editor to `/app` before launch.
- Connect and fund social / ad accounts before publishing paid traffic to the landing page
- The landing page and waitlist are staged; do not publish paid traffic until Pro subscription
  is live in App Store Connect
- **Anthropic spend cap**: set at console.anthropic.com before opening to users; suggested
  $50–100/month initially while monitoring per-export costs in Vercel logs

## Functional reality — CI wiring + deployed-env verification (BUILDS ≠ WORKS)

The runtime journey suite exists and RUNS GREEN (`cd web && npm run test:e2e`: Playwright builds +
`next start`s the app, drives real browser journeys, asserts intended outcomes). Two owner steps the
loop cannot do (can't edit `.github/`, can't reach prod):

- **Wire the journey suite into CI** (`.github/workflows/ci.yml`) as a job: `cd web && npm ci &&
  npx playwright install --with-deps chromium && npm run test:e2e`; fail the build on red. No DB to
  seed (only optional Vercel KV); leave `TURNSTILE_SECRET_KEY` UNSET in CI so captcha fails open and
  the waitlist/signup journey runs keyless. Consider making it a required check once stable.
- **Verify on the DEPLOYED URL** (the loop can only run locally): after each deploy, run
  `BASE_URL=https://<prod-host> npm run test:e2e` (skips the local server, drives prod) to confirm the
  same journeys pass on Vercel. NOTE: this product's `web/` has **no DB/migration chain** (only
  optional Vercel KV), so there is no "apply prod migrations" step; the standing config gaps are the
  unconnected waitlist email provider and unprovisioned Vercel KV (see OWNER_ACTIONS / Marketing).
  No code break reproduced locally — do not assume one; this item just pins prod === local.

## Functional reality — owner-only verification (BUILDS ≠ WORKS; can't run headlessly)

The automated functional suite (Track G4) RUNS every journey it can and asserts real outcomes, but
these cannot run headlessly/in CI and must NOT be assumed working — verify on a real device/account
before submission:
- **Real payment capture** — an actual (non-sandbox) App Store purchase charges and unlocks Pro;
  the sandbox E2E proves the entitlement flow, not real billing.
- **App Store sandbox edge cases** — interrupted/declined purchase, Ask-to-Buy, restore-purchases,
  refund/expiry, family sharing, region/price-tier behavior.
- **Device-only behavior** — real camera/photo-library capture + permission prompts, on-device
  export performance/thermals, share-sheet to TikTok/Reels/Shorts on a physical device.
- **Email/push deliverability** — that confirmation/lifecycle emails actually arrive (inbox, not
  spam) and any push notifications deliver — verify with the real connected provider once set.
