# ROADMAP — HighlightMagic to a 100%-complete, revenue-generating product

Convergence anchor for the autonomous loop. Read every run with README.md + plan.md + docs/MODEL_COSTS.md.
Build toward the Definition of Done, phase by phase, then STOP and hand off.
VERIFY current state yourself each run — this reflects a snapshot and the repo evolves.

## Vision (the bar — do NOT stop short of it)
Make HighlightMagic a **100% complete business**, not just a shippable app. "Done" requires
BOTH of these at 100%, independently verified:
  1. **PRODUCT** — a freemium iOS app (Swift 6 / iOS 18 + Next.js backend on Vercel) that is
     genuinely **App-Store-acceptable** (would pass review), world-class in quality, and whose
     **monetization is OPTIMIZED to MAXIMIZE revenue — ≥$100K/yr is the FLOOR, not the target.**
  2. **MARKETING + GROWTH** — a real, built marketing engine: landing/waitlist site, brand,
     ASO, content/owned-channel assets, analytics, and a funnel — everything buildable
     without the owner's live accounts.
It is NOT done until a **documented, benchmark-grounded revenue model (docs/BUSINESS_CASE.md)** shows a
**REVENUE-MAXIMIZED, defensible path that clears ≥$100K/yr as the FLOOR** (monetization levers built
and pushed toward the OPTIMISTIC scenario — do NOT settle at the floor), AND a complete
**REMAINING_STEPS.md** lists — IN ORDER — only the things the OWNER must do that the loop physically
cannot (billing, signing, submission, funding accounts). Anything the loop CAN build, it builds.
CONVERGENCE: maximize WITHIN the submission-readiness goal — build the best monetization+growth
MACHINE buildable pre-launch, then STOP and hand off (this does NOT mean running forever; continuous
post-launch optimization with real conversion/retention data is the owner's job).

**FULL AUTONOMY:** create whatever advances this — new files, web pages, marketing assets,
backend code, internal tools/dashboards, evals, docs. Do not wait for permission.
**HONESTY:** never fabricate a "guarantee," fake metrics, or invent reviews. The revenue
case must be a grounded model from researched comps (pricing × realistic conversion ×
funnel/CAC × COGS), with assumptions stated. A credible, defensible path — not a fiction.
**Don't waste the owner's time:** a quiet, coherent, bar-clearing run is success; padding,
churn, or declaring done before the bar is met is failure.

## Progress format contract (checkboxes are the SINGLE SOURCE OF TRUTH)
Every Track item (A–F, P0, Evals) AND every Definition-of-Done item MUST be a markdown
checkbox (`- [ ]` open / `- [x]` done) — never recorded only as prose. Tick a box ONLY under
the DONE GUARD below (merged + artifacts verified-present + gate re-run green), IN ADDITION to
any PR-reference annotation (e.g. `*(#42)*`) — the annotation is supplementary, the checkbox is
authoritative. An external dashboard reads BUILD progress from the Track checkboxes and
READINESS from the Definition-of-Done checkboxes; prose-only or PR-only notes are INVISIBLE to
it, so progress not reflected in a checkbox does not count.
- ONE-TIME RECONCILE (do on the next run): convert any non-checkbox Track or Definition-of-Done
  item into a checkbox; tick every item whose artifacts are verified-present on `main` with a
  green gate (per the DONE GUARD); and UN-tick any box not actually satisfied. Then proceed normally.
- ONGOING: keep the checkboxes in sync with reality in EVERY bookkeeping run — tick on real
  completion, un-tick on regression. Never leave a box stale.

## Living artifacts (operating principle)
Every artifact the loop produces — README, ARCHITECTURE, docs/BUSINESS_CASE.md, marketing copy,
store-listing/ASO, privacy/data-safety docs, the pre-submission checklist, the loop-memory file,
IMPROVEMENT_LOG, PENDING_OPS, REMAINING_STEPS, ROADMAP — is LIVING. When the thing it describes
changes (code, pricing, positioning, data flows, architecture), UPDATE the artifact in the SAME
work so it never contradicts the current product. A doc that contradicts reality is a BUG (and a
store-review / trust risk); fixing it CLEARS the value bar.
Avoid BOTH failure modes equally: (a) STALE — write-once docs that drift out of date;
(b) CHURN — rewriting things for their own sake. The rule is CONSISTENCY WITH REALITY, not constant
rewriting. Do NOT churn STABLE ANCHORS just to look busy — the Vision/goal, the guard rules (DONE
GUARD, API COST CONTRACT, anti-gaming, privacy/security bar), and the protected guard/CI tests are
intentionally stable ratchets; change them only on a real, justified shift.

## P0 — Cost & entitlement architecture (HIGHEST PRIORITY — do first)
The iOS app historically called paid APIs DIRECTLY (embedded/Keychain key in ClaudeVisionService
etc.) and StoreKit entitlement is CLIENT-ONLY. For a freemium business that pays the API bill,
that lets an extracted key or modified client run up cost and bypass the free limit. Fix it:
- [x] MODEL DECIDED (owner, 2026-06-25): **BUSINESS-PAID**, NOT bring-your-own-key. This SUPERSEDES
      every prior "BYOK" assumption anywhere in the repo (loop-memory/PENDING_OPS/BUSINESS_CASE) —
      correct all BYOK references; the business-paid routing bullets below DO apply and MUST be built.
- [ ] Route ALL paid API calls (Anthropic/ElevenLabs/AtlasCloud) through the `web/` backend;
      REMOVE the embedded/Keychain API-key path from the iOS app (ClaudeVisionService etc.);
      keys live SERVER-SIDE only.
- [ ] Enforce the free quota (5 free exports/mo + watermark) + Pro entitlement SERVER-SIDE,
      authoritatively, BEFORE any paid call (App Store Server API / signed-transaction
      verification), so a tampered client cannot run up the bill or bypass the limit.
- [ ] Meter + log per-export API cost; cap regeneration (plan.md: <=2 validation passes);
      verify/extend the existing detection-cache + asset-cache.
- [ ] Redo docs/BUSINESS_CASE.md COGS under BUSINESS-PAID: ALL of Claude detection + ElevenLabs +
      AtlasCloud are business-borne now (the prior BYOK split understated COGS — re-derive the margin).

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
- [x] B4. Cost-optimized model selection (multimodal COGS is the margin — docs/MODEL_COSTS.md).
      RESEARCH cheaper hosted AND open-source/self-hostable models per paid task; benchmark
      quality-vs-cost; route each task to the cheapest model that clears its quality bar;
      config-driven model map; dated decision log. DONE when the map + benchmark + log exist
      and each task uses its cheapest passing model.

## Track C — Monetization (StoreKit 2)
- [ ] C1. Pro subscription with SERVER-VERIFIED entitlement.
      *(client-side sync fixed #31; server verification still needed — ties to P0/B3)*
- [ ] C2. Paywall at the real value moment; restore purchases; manage subscription;
      5 free exports/mo + watermark, Pro unlimited + no watermark. Price points chosen from
      researched comps (record rationale in docs/BUSINESS_CASE.md).

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
- [x] E1. Conversion-focused **landing page + waitlist** on web/ (hero, demo/preview, value
      props, pricing, FAQ, email capture wired to a store the owner can later connect).
      *(landing page + /api/waitlist #42)*
- [x] E2. **Brand kit**: name treatment, color/type system, logo/app-icon usage, voice/tone,
      social avatar/banner, OG/share images — as real assets + a brand guide doc.
      *(docs/brand-kit.md #46)*
- [x] E3. **ASO package**: title/subtitle/keyword variants, description, promo text,
      screenshot captions + a screenshot/preview shotlist — grounded in category research.
      *(docs/aso-package.md #47)*
- [x] E4. **Content + owned-channel engine**: a batch of post drafts (TikTok/Reels/Shorts/X),
      hooks, captions, a posting calendar, and short-form video concept scripts. BUILD +
      STAGE only — never auto-publish; publishing/ads are owner steps on funded accounts.
      *(docs/content-calendar.md + docs/content/post-batch-1.md #48)*
- [x] E5. **Analytics + funnel**: privacy-respecting web analytics + event taxonomy
      (visit → waitlist → install → activate → export → Pro), conversion instrumentation,
      and a simple dashboard. No fake numbers — measure the real funnel once live. These
      real numbers feed back into docs/BUSINESS_CASE.md (Track F) over time, so the estimate
      improves from data instead of staying a launch-day guess.
      *(web/src/lib/analytics.ts + landing page events #49)*

## Track F — Business case (the finish-line gate; LIVING doc: docs/BUSINESS_CASE.md)
`docs/BUSINESS_CASE.md` is a LIVING document the loop builds and keeps current every run.
Not vibes — math, with cited inputs. It must contain:
- [ ] F1. **Bottoms-up model**: annual revenue = paying_users × price × 12 − churn/refunds/
      fees, with the FULL funnel spelled out (reach → signup% → free→paid%), each step a number.
- [ ] F2. **Research-grounded inputs** (cited, NEVER invented): category/competitor pricing;
      typical freemium free→paid (realistically a few %); retention/churn norms; traffic/
      acquisition assumptions. Pull via web research; cite source + date for each input.
- [ ] F3. **Unit economics**: per-user (per-export) inference cost from docs/MODEL_COSTS.md →
      gross margin per plan. An unprofitable-per-user plan is a FAILURE to flag and fix —
      this is exactly why the API COST CONTRACT matters.
- [ ] F4. **Three scenarios**: conservative / base / optimistic, each with the inputs behind
      it, and an explicit statement of which one is the TARGET/expected.
- [ ] F5. **Honesty + levers**: if the BASE case does not reach $100K/yr, SAY SO plainly and
      name the specific levers (higher tier, better paywall conversion, a growth channel,
      usage/add-on revenue) — then go BUILD them (they become roadmap work, not just notes).
- [ ] F6. **Go-to-market**: tie Track E channels to the funnel targets and what the owner
      must fund/launch to hit the model.
- [ ] F7. **Living feedback**: once E5 analytics is live, fold REAL funnel numbers back into
      the model so the projection converges on reality.
- [ ] F8. **MAXIMIZE revenue ($100K is the FLOOR, not the target)**: do NOT settle once the base
      case clears $100K — build toward the OPTIMISTIC scenario by pushing each revenue lever to its
      DEFENSIBLE maximum (every number honest + researched — anti-gaming holds absolutely), each
      lever first-class value-bar-clearing work, with its upside documented in docs/BUSINESS_CASE.md:
      PRICING & TIERS (good-better-best, annual at a discount, consumable export-credit packs);
      CONVERSION (free→paid moment — paywall at the finished highlight, onboarding, trial, faster
      time-to-first-export); RETENTION & LTV (cut churn; re-engagement push, save/share loops);
      EXPANSION (add-ons, credit packs, creator/higher tier, referrals); MARGIN (drive per-export
      COGS DOWN — a PRIMARY lever for HighlightMagic, since lower COGS widens the freemium margin
      and funds growth); REACH (ASO, organic/social since the output is shareable, content/SEO).
      Build the best-return ones. Maximize WITHIN convergence — see the CONVERGENCE note in Vision.
- [ ] F9. **KEEP IT LIVING — recompute, don't write-once**: docs/BUSINESS_CASE.md must IMPROVE over
      time, not be written once and left to rot.
      - RE-COMPUTE the model whenever any of these change: pricing/tiers, a revenue lever ships
        (conversion, retention, expansion), per-user COGS, or new evidence/benchmarks.
      - Building more FEATURES does NOT change the number and is NOT a reason to revise it — only
        levers, pricing, margin, reach, and real data move it. "Improving the business case" means
        recomputing when those move, not when feature count grows.
      - ANCHOR the model to the ACTUAL paywall / billing config (Stripe/RevenueCat/StoreKit product
        IDs + prices). If the doc's prices ever diverge from the real product config, that drift is
        a BUG — fix it and recompute.
      - Stamp each revision with a 'last recomputed' date + a one-line changelog of what moved and why.
      - POST-LAUNCH (owner activity): re-ground every assumption on the REAL conversion/retention/CPI
        data from the analytics you built — that's when it goes from a researched projection to a
        data-backed forecast.

## Track G — World-class quality, validation & evals
How quality is continuously re-validated IN DEPTH — enforced gates on every change + complete
evals + periodic deep audits. (This is NOT a pretense of re-reviewing every character every
run; it is layered, automated, and auditable.) NOTE: "Track F" is the business case above;
this quality track is G.
- [ ] G1. Lint/format clean + ENFORCED — web lint (and Swift lint, e.g. SwiftLint, if present)
      at ZERO errors and no new warnings, kept clean. Reviewer A rejects any change that
      introduces a lint error/warning. Owner promotes lint to a REQUIRED CI check once green.
- [ ] G2. Coverage floor — enforce a meaningful test-coverage threshold on web/backend critical
      paths (Vitest `--coverage`) and on iOS logic modules (XCTest); a drop below the floor FAILS.
- [ ] G3. Detection/generation EVAL coverage COMPLETE — a live eval per CORE PIPELINE STAGE
      (highlight-detection accuracy, clip selection, music/SFX/voiceover quality, export
      correctness) against a GROWING gold set of real video fixtures, gated behind an env flag
      (e.g. `RUN_EVALS=1`) so normal CI doesn't spend; wire a SCHEDULED eval run so AI-output
      quality regressions are caught. Live eval API spend is approved.
- [ ] G4. E2E + accessibility + visual + performance gates — XCUITest (iOS) for the core
      journey (import → detect → edit → export → share) + Playwright (web); automated a11y
      checks on key surfaces; visual checks on the design-bar screens; a performance/stability
      budget (no jank/crashes on the core path; export within a time budget).
- [ ] G5. Periodic DEEP AUDIT (holistic) — recurring whole-codebase audit beyond per-diff
      review (see the routine's PERIODIC DEEP AUDIT). Latest audit must be clean of CRITICAL
      findings (security, crashes, runaway API cost, data loss) for done.

## Definition of Done (STOP gate — BOTH halves at 100%)
Open `FACTORY: 100% — ready for submission + launch` and stop ONLY when ALL of these checkboxes
are ticked under the DONE GUARD, CI-verified:
- [ ] DOD1. PRODUCT: Tracks A–D + P0 complete; `web` and `ios` checks green; evals pass; per-export
      COGS within a viable margin (B4 / docs/MODEL_COSTS.md).
- [ ] DOD2. MARKETING/GROWTH: Track E complete and staged (landing+waitlist, brand, ASO, content,
      analytics/funnel built).
- [ ] DOD3. BUSINESS CASE (revenue-MAXIMIZED): docs/BUSINESS_CASE.md presents a credible,
      benchmark-grounded path that clears ≥$100K/year as the FLOOR AND is revenue-MAXIMIZED — the
      maximization levers (F8) are built + documented and the ceiling is pushed toward the
      OPTIMISTIC scenario (not stopped at the floor); unit economics are gross-margin-positive; the
      GTM (F6) is documented. The final `FACTORY: 100%` issue must include the one-paragraph "here's
      the math on why this can realistically make ≥$100K/yr (and how we maximized it) — and here are
      the levers" summary, drawn from docs/BUSINESS_CASE.md (no invented numbers).
- [ ] DOD4. HANDOFF: complete docs, and **REMAINING_STEPS.md** lists — IN ORDER — only owner-only steps.
- [ ] DOD5. QUALITY: Track G complete — lint enforced + clean (G1), coverage floors met (G2),
      the eval suite is complete + scheduled (G3), E2E/a11y/visual/perf gates green (G4), and the
      latest deep audit (G5) is clean of CRITICAL findings.
If any box is open, advance the lowest incomplete item. Do not declare done early.

## DONE GUARD (a box counts as done ONLY with verified artifacts — never self-assessment)
Before ticking ANY checkbox in this file (or recording any item complete in IMPROVEMENT_LOG/
loop-memory), ALL THREE must hold IN THE SAME RUN. A box ticked without them is a FALSE
completion and a FAILURE — it wastes the owner's time worse than leaving it open:
  1. **MERGED** — the change is actually merged to `main` (verify with git/gh). NEVER tick on
     an open, draft, or CI-failing PR.
  2. **ARTIFACTS EXIST** — the concrete deliverable the item promises is present on `main` at
     its real path and is REAL, not a stub/placeholder/TODO. E.g.: a web page/route that
     actually builds and renders; brand/marketing/screenshot asset FILES that exist; a
     docs/BUSINESS_CASE.md section filled with CITED numbers (not "TBD"); a test/eval file
     that exists AND runs; a code path that is wired in and reachable, not dead. Open the
     file(s) and confirm.
  3. **GATE RE-RUN GREEN** — re-run the relevant gate to GREEN this run, do not trust a prior
     run or a self-assessment: web → `cd web && npm ci && npm run build && npm test`; iOS →
     the `ios` CI check on the merge commit; evals → actually run the eval.
When unsure whether an artifact truly exists or works, treat the item as NOT done. The SAME
standard gates the final Definition of Done: do NOT declare 100% / open the `FACTORY: 100%`
issue unless every track's artifacts are verified-present on `main` AND both `web` + `ios`
gates are green in that run, AND docs/BUSINESS_CASE.md actually contains the cited model.

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
