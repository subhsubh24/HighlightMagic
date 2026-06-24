# ROADMAP — HighlightMagic to a 100%-complete, revenue-generating product

Convergence anchor for the autonomous loop. Read every run with README.md + plan.md + docs/MODEL_COSTS.md.
Build toward the Definition of Done, phase by phase, then STOP and hand off.
VERIFY current state yourself each run — this reflects a snapshot and the repo evolves.

## Vision (the bar — do NOT stop short of it)
Make HighlightMagic a **100% complete business**, not just a shippable app. "Done" requires
BOTH of these at 100%, independently verified:
  1. **PRODUCT** — a freemium iOS app (Swift 6 / iOS 18 + Next.js backend on Vercel) that is
     genuinely **App-Store-acceptable** (would pass review) and reliably monetized.
  2. **MARKETING + GROWTH** — a real, built marketing engine: landing/waitlist site, brand,
     ASO, content/owned-channel assets, analytics, and a funnel — everything buildable
     without the owner's live accounts.
It is NOT done until a **documented, benchmark-grounded revenue model (REVENUE.md)** shows a
**defensible path to ~$100K/year**, AND a complete **REMAINING_STEPS.md** lists — IN ORDER —
only the things the OWNER must do that the loop physically cannot (billing, signing,
submission, funding accounts). Anything the loop CAN build, it builds.

**FULL AUTONOMY:** create whatever advances this — new files, web pages, marketing assets,
backend code, internal tools/dashboards, evals, docs. Do not wait for permission.
**HONESTY:** never fabricate a "guarantee," fake metrics, or invent reviews. The revenue
case must be a grounded model from researched comps (pricing × realistic conversion ×
funnel/CAC × COGS), with assumptions stated. A credible, defensible path — not a fiction.
**Don't waste the owner's time:** a quiet, coherent, bar-clearing run is success; padding,
churn, or declaring done before the bar is met is failure.

## P0 — Cost & entitlement architecture (load-bearing; revenue + cost boundary)
The iOS app historically called paid APIs DIRECTLY and StoreKit entitlement is CLIENT-ONLY.
For a freemium business that pays the API bill, that lets an extracted key or modified
client run up cost and bypass the free limit. Enforce the model:
- [ ] Confirm intended model (business-paid vs bring-your-own-key). If business-paid:
- [ ] Route ALL paid API calls (Claude/ElevenLabs/AtlasCloud) through the `web/` backend;
      remove embedded keys from the iOS app; keys live server-side only.
- [ ] Enforce the free quota (5 exports/user/month) + Pro entitlement SERVER-SIDE before
      any paid call (App Store Server API / signed-transaction verification).
- [ ] Meter + log per-export API cost; cap regeneration (plan.md: <=2 validation passes);
      verify/extend the existing detection-cache + asset-cache.

## Track A — iOS app (complete + polish to App-Store quality)
- [x] A1. iOS CI green (`xcodebuild build test`) and promoted to a REQUIRED check.
      *(SwiftPM test target #15; CI destination/Xcode/sim fix + first full compile of the
      app (~50 errors) + 3 test fixes in #16; `ios` promoted to required. The cloud loop
      CANNOT run xcodebuild — iOS changes are gated by the required `ios` check, so make them
      conservatively and lean on areas you can fully verify.)*
- [ ] A2. Core flow end-to-end with no dead ends: import/capture -> detect -> editor (trim,
      captions, filters, music/SFX/voiceover) -> 1080x1920 export -> share sheet.
- [ ] A3. Swift 6 strict-concurrency correctness (no data races; actors correct; no
      main-thread blocking); remove crash risks.
      *(fatalError removed #13; baseAddress! #23; model ID + blocking read #26; concurrency
      hardening for ExportService/ClipGeneration in #16; broader audit pending)*
- [ ] A4. Real empty/loading/error states; smooth playback/scrubbing/trim; performance; no
      crashes on the core path.
- [ ] A5. Design quality bar (intentional, not generated-looking); correct Info.plist
      permission usage strings.

## Track B — Backend + API cost (web/, on Vercel)
- [ ] B1. Generation pipeline reliable (detection -> selection -> music/SFX/voiceover ->
      assembly -> validation loop) with retry/backoff.
- [x] B2. API COST discipline: cheapest capable model by default; escalate only on a
      deterministic signal; minimize payload; cache; cap regeneration; cost metering.
      *(cost metering #17; frame cap #19; model IDs centralized #11; planner/validator
      pricing #25/#26/#28 — COMPLETE)*
- [ ] B3. Server-side freemium enforcement + entitlement (ties to P0).
- [ ] B4. Cost-optimized model selection (multimodal COGS is the margin — docs/MODEL_COSTS.md).
      RESEARCH cheaper hosted AND open-source/self-hostable models per paid task; benchmark
      quality-vs-cost; route each task to the cheapest model that clears its quality bar;
      config-driven model map; dated decision log. DONE when the map + benchmark + log exist
      and each task uses its cheapest passing model.

## Track C — Monetization (StoreKit 2)
- [ ] C1. Pro subscription with SERVER-VERIFIED entitlement.
      *(client-side sync fixed #31; server verification still needed — ties to P0/B3)*
- [ ] C2. Paywall at the real value moment; restore purchases; manage subscription;
      5 free exports/mo + watermark, Pro unlimited + no watermark. Price points chosen from
      researched comps (record rationale in REVENUE.md).

## Track D — Store readiness & compliance
- [x] D1. Honest privacy policy + terms (hosted on web/); PrivacyInfo.xcprivacy + App
      Privacy labels accurate to what's actually sent. *(policy #12; PrivacyInfo.xcprivacy pending)*
- [ ] D2. In-app account deletion if accounts exist (Apple 5.1.1(v)); ATT only if tracking.
- [ ] D3. App Store listing complete: icon, screenshots, preview video, ASO title/subtitle/
      keywords, description, support URL. *(Terms/Support pages #32; ASO copy #22; screenshots +
      preview video need a device/simulator — likely owner, but generate everything spec-able:
      copy, keyword sets, screenshot captions/layout specs, a shotlist.)*
- [x] D4. Stability pass: no crashes; sensible permissions; no debug/placeholder content. *(#22)*

## Track E — Marketing engine + growth (build to 100%; publishing gated on funded accounts)
- [ ] E1. Conversion-focused **landing page + waitlist** on web/ (hero, demo/preview, value
      props, pricing, FAQ, email capture wired to a store the owner can later connect).
- [ ] E2. **Brand kit**: name treatment, color/type system, logo/app-icon usage, voice/tone,
      social avatar/banner, OG/share images — as real assets + a brand guide doc.
- [ ] E3. **ASO package**: title/subtitle/keyword variants, description, promo text,
      screenshot captions + a screenshot/preview shotlist — grounded in category research.
- [ ] E4. **Content + owned-channel engine**: a batch of post drafts (TikTok/Reels/Shorts/X),
      hooks, captions, a posting calendar, and short-form video concept scripts. BUILD +
      STAGE only — never auto-publish; publishing/ads are owner steps on funded accounts.
- [ ] E5. **Analytics + funnel**: privacy-respecting web analytics + event taxonomy
      (visit → waitlist → install → activate → export → Pro), conversion instrumentation,
      and a simple dashboard. No fake numbers — measure the real funnel once live.

## Track F — Revenue model & business case (the finish-line gate)
- [ ] F1. **REVENUE.md**: a grounded unit-economics model — pricing, realistic free→Pro
      conversion + retention from researched comps (cite sources/dates), COGS per export
      (from docs/MODEL_COSTS.md), LTV/CAC, and the math for a defensible path to ~$100K/year,
      with best/base/worst sensitivity and the assumptions that must hold. NO invented metrics.
- [ ] F2. **Go-to-market plan** tying Track E to F1: which channels, the funnel targets, and
      what the owner must fund/launch to hit the model.

## Evals (first-class)
- [ ] Golden video fixtures + expected highlight ranges; a live `.eval` (env-flag-gated so
      normal CI doesn't spend) that runs real detection and asserts quality; grow over time.

## Definition of Done (STOP gate — BOTH halves at 100%)
Open `FACTORY: 100% — ready for submission + launch` and stop ONLY when ALL hold, CI-verified:
  1. PRODUCT: Tracks A–D + P0 complete; `web` and `ios` checks green; evals pass; per-export
     COGS within a viable margin (B4 / docs/MODEL_COSTS.md).
  2. MARKETING/GROWTH: Track E complete and staged (landing+waitlist, brand, ASO, content,
     analytics/funnel built).
  3. BUSINESS CASE: REVENUE.md (F1) presents a credible, benchmark-grounded path to ~$100K/year,
     and F2 GTM plan is documented.
  4. HANDOFF: complete docs, and **REMAINING_STEPS.md** lists — IN ORDER — only owner-only steps.
If any box is open, advance the lowest incomplete item. Do not declare done early.

## REMAINING_STEPS.md (owner-only, IN ORDER — maintained by the loop)
Maintain a top-level `REMAINING_STEPS.md` listing, in the exact order the owner should do them,
ONLY the actions the loop physically cannot take. Keep it current every run. Expected contents:
  1. Apple Developer Program enrollment ($99/yr) + signing/provisioning + App Store Connect app record.
  2. Create StoreKit live products/subscriptions + prices in App Store Connect (IDs from the repo).
  3. Set live API keys (ANTHROPIC/ELEVENLABS/ATLASCLOUD) in Vercel env; set the Anthropic spend cap.
  4. Connect the waitlist email store + analytics destination; point the domain/DNS at Vercel.
  5. Build + upload screenshots/preview video (needs a device/simulator) from the provided shotlist.
  6. TestFlight build, then App Store submission + respond to review.
  7. Fund/launch marketing + ad accounts and start the content calendar.
Each item: what to do, where, and what in the repo it maps to. Nothing the loop could have done.

## Guardrails
Live secrets/signing/billing are human-applied (PENDING_OPS.md + REMAINING_STEPS.md); never
auto-publish marketing or run prod migrations; never edit .claude/ or .github/; ground all
marketing/revenue claims in real research; coherence over volume; the value bar never drops
to hit a count.

## Human Core (only the owner can do — summary; see REMAINING_STEPS.md for the ordered list)
Apple Developer account + signing + App Store Connect; StoreKit live products; TestFlight;
submission + review; live backend API keys + Vercel env; Anthropic spend cap; domain/DNS;
connect waitlist/analytics destinations; fund + launch marketing/ad accounts.
