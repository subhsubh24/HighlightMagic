# ROADMAP — HighlightMagic to App-Store-ready, revenue-generating

Convergence anchor for the autonomous loop. Read every run with README.md + plan.md.
Build toward the Definition of Done, phase by phase, then STOP and hand off.
VERIFY current state yourself each run — this reflects a snapshot and the repo evolves.

## Goal
Ship HighlightMagic — a freemium iOS app (Swift 6 / iOS 18, with a Next.js backend in
`web/` on Vercel) that turns personal videos into share-ready vertical highlights — to
App-Store-acceptable, reliably-monetized quality, then submit. Both the iOS app and the
web backend already exist and are substantially built; the work is COMPLETE + POLISH +
HARDEN + make the freemium economics safe.

## P0 — Cost & entitlement architecture (do this first; it's load-bearing)
Today the iOS app calls paid APIs DIRECTLY (e.g. ClaudeVisionService → api.anthropic.com
with a key from env/Keychain/Info.plist) and StoreKit entitlement is CLIENT-ONLY
(StoreKitService.isProUser, no server verification). For a freemium business that pays the
API bill, that lets an extracted key or modified client run up cost and bypass the free
limit. Decide and enforce the model:
- [ ] Confirm intended model (business-paid vs bring-your-own-key). If business-paid:
- [ ] Route ALL paid API calls (Claude/ElevenLabs/AtlasCloud) through the `web/` backend;
      remove embedded keys from the iOS app; keys live server-side only.
- [ ] Enforce the free quota (5 exports/user/month) + Pro entitlement SERVER-SIDE before
      any paid call (App Store Server API / signed-transaction verification).
- [ ] Meter + log per-export API cost; cap regeneration (plan.md: <=2 validation passes);
      verify/extend the existing detection-cache + asset-cache.

## Track A — iOS app (complete + polish to App-Store quality)
- [ ] A1. CI: make `xcodebuild ... build test` green for the iOS app (add a shared scheme
      + a SwiftPM test target, or build the .xcodeproj app+test target); then promote the
      `ios` CI check to required.
- [ ] A2. Core flow end-to-end with no dead ends: import/capture -> detect -> editor (trim,
      captions, filters, music/SFX/voiceover) -> 1080x1920 export -> share sheet.
- [ ] A3. Swift 6 strict-concurrency correctness (no data races; actors correct; no
      main-thread blocking); remove crash risks (e.g. the fatalError in UserAccountService).
- [ ] A4. Real empty/loading/error states; smooth playback/scrubbing/trim; performance; no
      crashes on the core path.
- [ ] A5. Design quality bar (intentional, not generated-looking); correct Info.plist
      permission usage strings.

## Track B — Backend + API cost (web/, on Vercel)
- [ ] B1. Generation pipeline reliable (detection -> selection -> music/SFX/voiceover ->
      assembly -> validation loop) with the retry/backoff already present in detect.ts.
- [ ] B2. API COST discipline: cheapest capable model by default; escalate only on a
      deterministic signal; minimize payload; cache; cap regeneration; cost metering.
- [ ] B3. Server-side freemium enforcement + entitlement (ties to P0).

## Track C — Monetization (StoreKit 2)
- [ ] C1. Pro subscription (StoreKitService exists) with SERVER-VERIFIED entitlement.
- [ ] C2. Paywall at the real value moment; restore purchases; manage subscription;
      5 free exports/mo + watermark, Pro unlimited + no watermark.

## Track D — Store readiness & compliance
- [ ] D1. Privacy policy + terms (host on web/) that HONESTLY disclose video is uploaded to
      processing APIs; PrivacyInfo.xcprivacy + App Privacy labels accurate to what's sent.
- [ ] D2. In-app account deletion if accounts exist (Apple 5.1.1(v)); ATT only if tracking.
- [ ] D3. App Store assets: icon (present), screenshots, preview video, ASO copy, support URL.
- [ ] D4. Stability pass: no crashes; sensible permissions; no debug/placeholder content.

## Track E — Marketing engine + web site
- [ ] E1. Waitlist/landing page, brand kit, ASO/store copy, content + owned-channel post
      drafts, analytics. BUILD + STAGE only (publishing/ads gated on connected funded accounts).

## Evals (first-class)
- [ ] Golden video fixtures + expected highlight ranges; a live `.eval` (gated behind an env
      flag so normal CI doesn't spend) that runs the real detection and asserts quality;
      grow over time. Live eval spend is approved.

## Definition of Done (STOP gate)
All tracks' boxes ticked AND verified in CI, P0 resolved, detection/generation evals pass,
and per-export COGS is within a viable freemium margin -> open `FACTORY: ready for submission`
and stop building.

## Human Core (only the owner can do)
Apple Developer account + signing/provisioning + App Store Connect; StoreKit live products;
TestFlight; final submission + review responses; live backend API keys + Vercel env;
Anthropic Console spend cap; connect + fund marketing/ad accounts.

## Guardrails
Live secrets/signing human-applied (PENDING_OPS.md); migrations human-applied; never edit
.claude/ or .github/; coherence over volume; the value bar never drops to hit a count.
