# Improvement Log

Tracks every change merged to `main` by the autonomous factory loop.
Format: newest first. Only MERGED changes appear here.

| PR | Title | Track | Merged |
|---|---|---|---|
| #151 | fix(P0): meter per-export API cost on both validation routes (/api/validate streaming + /api/ios-validate) — last unmetered paid LLM call sites | P0 | Run 24 |
| #149 | fix(B6): bound the last untimed external fetches (validate/email/Turnstile) + H5 CAPTCHA-required test | B6 | Run 23 |
| #137 | feat(H7): per-user daily generation ceiling on all paid sub-call routes + gate /api/ios-validate | H7 | Run 22 |
| #138 | fix(D): correct App Store metadata to honest business-paid model (no BYOK, cloud-first, uses gen-AI) | D | Run 22 |
| #139 | feat(G4/G6): capture + commit journey screenshots (see what the user sees) | G4/G6 | Run 22 |
| #141 | feat(design): rework the free-limit paywall into an intentional, on-brand conversion moment | Design | Run 22 |
| #127 | fix(D/C2): align iOS StoreKit + metadata pricing to $14.99/$149.99 | D/C2 | Run 21 |
| #126 | fix(D/F): align web + ASO pricing to $14.99/$149.99 + annual line | D/F | Run 21 |
| #125 | test(G2): cover analytics.trackEvent (SSR-safety, dispatch, prop cleaning) | G2 | Run 21 |
| #124 | feat(H2/H3): route hardening — generic errors + array bounds on paid routes | H2/H3 | Run 21 |
| #123 | feat(E6): Growth Execution engine — waitlist double-opt-in + email/social/metrics plumbing | E6 | Run 21 |
| #115 | meta(Run 20): post-#114 — tick P0 server-side-entitlement bullet + C1; mark iOS send-side done | meta | pending #115 |
| #114 | feat(P0/C1): iOS attaches StoreKit signed transaction (result.jwsRepresentation) to ios-score/ios-plan — completes the entitlement loop | P0/C1 | Run 20 |
| #113 | meta(Run 20): housekeeping — fix stale APP_STORE/product-id docs; tick H2; record #110–#112; iOS send-side queued | meta | Run 20 |
| #112 | test(G2): cover proxy-video + animate/check routes; fold ElevenLabs ceiling/NaN/empty cases into elevenlabs.test.ts | G2 | Run 20 |
| #111 | feat(H2): server-side input-size bounds on paid routes before the provider call (shared input-bounds.ts) | H2 | Run 20 |
| #110 | feat(P0/C1): real server-side App Store JWS entitlement verification (x5c chain + ES256 + Pro-SKU/expiry/revocation) | P0/C1 | Run 20 |
| #109 | meta(Run 19): housekeeping — corrects false P0-done claim; LOOP_MEMORY, IMPROVEMENT_LOG, REMAINING_STEPS, ROADMAP | meta | pending #109 |
| #108 | feat(H2): bound clips/clipFrames payload (MAX_FILES) before the paid validate calls | H2 | 2026-06-27 |
| #107 | fix(D): correct stale BYOK claims in Terms — describe the business-paid AI model | D | 2026-06-27 |
| #106 | feat(H1): rate-limit the 13 remaining paid/expensive backend routes | H1 | 2026-06-27 |
| #105 | feat(P0/H1): remove LAST embedded Anthropic key from TapeValidationService; add /api/ios-validate (+rate limit) — rescued stuck #100/#84 | P0/H1 | 2026-06-27 |
| #104 | ROADMAP Track E: add E6 — Growth EXECUTION engine (server-side, in web/) | E6 | 2026-06-27 |
| #103 | meta(Run 18): housekeeping — LOOP_MEMORY, IMPROVEMENT_LOG, REMAINING_STEPS | meta | 2026-06-27 |
| #102 | feat(H6): security headers — HSTS, X-Content-Type-Options, X-Frame-Options, CORS; consolidate from vercel.json | H6 | 2026-06-27 |
| #101 | feat(H): rate limiting (H1), spend ceiling (H7), CAPTCHA (H5), validate quota gate, error hygiene (H3) | H1/H3/H5/H7 | 2026-06-27 |
| #100 | feat(P0): rescue ios-validate (TapeValidationService) | P0 | CLOSED — stuck (stale base + Swift type error); superseded by #105 |
| #91 | meta(Run 16): housekeeping — LOOP_MEMORY, IMPROVEMENT_LOG, REMAINING_STEPS | meta | 2026-06-26 |
| #90 | test(G2): add route tests for /api/ios-score (6 tests) | G2 | 2026-06-26 |
| #89 | feat(G3): add gaming/esports highlight detection fixture | G3 | 2026-06-26 |
| #88 | feat(security): optional userId quota gate for /api/validate | security/P0 | CLOSED — logic folded into #101 |
| #87 | fix(ios): remove force-unwrap in ConfettiView; align fallback subscription prices | A3/C2 | 2026-06-26 |
| #86 | meta(Run 15): housekeeping — LOOP_MEMORY, IMPROVEMENT_LOG, REMAINING_STEPS | meta | 2026-06-26 |
| #85 | feat(P0): remove embedded API key from AIEffectRecommendationService; add /api/ios-plan backend | P0 | 2026-06-26 |
| #84 | feat(P0): remove embedded Anthropic key from TapeValidationService; add /api/ios-validate backend | P0 | CLOSED — never merged; superseded by #105 (Run 19) |
| #83 | feat(P0): remove embedded Anthropic key from ClaudeVisionService (disable direct calls) | P0 | 2026-06-26 |
| #82 | meta(Run 14): housekeeping — LOOP_MEMORY, IMPROVEMENT_LOG, REMAINING_STEPS | meta | 2026-06-26 |
| #81 | feat(G3): add cooking-highlight eval fixture for detect.eval.ts auto-discovery | G3 | 2026-06-26 |
| #80 | feat(P0): remove embedded Anthropic key from iOS; route frame scoring through /api/ios-score | P0 | 2026-06-26 |
| #79 | feat(P0): add /api/ios-score — iOS Haiku scoring proxy, removes embedded API key | P0 | 2026-06-26 |
| #78 | test(G2): extract mergeDuckSegments from audio-mux + 12 Vitest tests | G2 | 2026-06-26 |
| #77 | test(G2): export pure functions from frame-extractor + 29 Vitest tests | G2 | 2026-06-26 |
| #76 | meta(Run 13): housekeeping — IMPROVEMENT_LOG, LOOP_MEMORY, REMAINING_STEPS | meta | 2026-06-25 |
| #75 | feat(ios): P0 — BackendConfig URL resolver (prerequisite for key removal) | P0 | 2026-06-25 |
| #74 | feat(evals): G3 — travel fixture + auto-discover eval fixtures | G3 | 2026-06-25 |
| #73 | test(web): G2 — PR #61 route tests (24 tests, 4 routes) | G2 | 2026-06-25 |
| #72 | test(web): G2 — VercelKVQuotaStore unit tests (14 tests) | G2 | 2026-06-25 |
| #71 | BUSINESS_CASE: add machine-readable BUSINESS_CASE_SUMMARY block + floor flag | F1/meta | 2026-06-25 |
| #70 | ROADMAP: add LIVING ARTIFACTS operating principle | meta | 2026-06-25 |
| #69 | ROADMAP F9: make docs/BUSINESS_CASE.md a TRULY LIVING artifact (recompute, don't rot) | F1/meta | 2026-06-25 |
| #68 | meta(Run 12): housekeeping — deep audit record, LOOP_MEMORY, IMPROVEMENT_LOG, REMAINING_STEPS | meta | 2026-06-25 |
| #67 | test(G2): add route tests for /api/validate and /api/waitlist (12 tests) | G2 | 2026-06-25 |
| #66 | feat(B3): add Vercel KV-backed quota store; wire into getQuotaStore() | B3 | 2026-06-25 |
| #65 | test(G2): add coverage for post-processing pure functions (28 tests) | G2 | 2026-06-25 |
| #64 | test(G2): add coverage for ai-models cost estimation (17 tests) | G2 | 2026-06-25 |
| #63 | test(G2): add Vitest coverage thresholds (lines/functions/branches ≥60/60/50%) | G2 | 2026-06-25 |
| #62 | security: patch Vitest CRITICAL CVE + Vite HIGH CVEs via npm audit fix | security | 2026-06-25 |
| #61 | P0: add entitlement gate to all 8 remaining ungated paid API routes | P0/B3 | 2026-06-25 |
| #58 | Evals: add golden fixture + env-gated detection quality eval | G3 (partial) | 2026-06-25 |
| #57 | P0 (iOS): remove BYOK API-key input from SettingsView | P0 | 2026-06-25 |
| #56 | P0: add entitlement gate to /api/plan (Sonnet planner route) | P0/B3 | 2026-06-25 |
| #55 | P0: add entitlement gate to /api/sfx, /api/voiceover, /api/music routes | P0/B3 | 2026-06-25 |
| #54 | ROADMAP: add Track G (world-class quality, validation & evals) + DoD gate | meta | 2026-06-25 |
| #53 | P0: server-side entitlement gate + iOS frame-scoring proxy (business-paid) | P0/B3 | 2026-06-25 |
| #52 | P0 DECISION: BUSINESS-PAID (not BYOK) — correct the factory's wrong guess | P0/meta | 2026-06-25 |
| #51 | ROADMAP: add Progress format contract; make Definition-of-Done items checkboxes | meta | 2026-06-25 |
| #50 | meta(Run 10): housekeeping — loop state, improvement log, business case update | meta | 2026-06-25 |
| #49 | E5: Add Plausible analytics module + wire landing page conversion events | E5 | 2026-06-25 |
| #48 | E4: Add content calendar + 12 post scripts (8-week launch plan) | E4 | 2026-06-25 |
| #47 | E3: Add App Store Optimization package (name, keywords, description, screenshots) | E3 | 2026-06-25 |
| #46 | E2: Add brand kit guide — colors, type, voice, logo & social assets spec | E2 | 2026-06-25 |
| #45 | B4: Switch planner from Opus 4.8 → Sonnet 4.6 (−80% COGS per export) | B4 | 2026-06-25 |
| #42 | Add E1 marketing landing page at /landing + /api/waitlist email capture endpoint | E1 | 2026-06-24 |
| #37 | Fix A3: replace 8 URL force-unwraps in ElevenLabsService with guard-let | A3 | 2026-06-24 |
| #36 | Fix A3: missing introCardEnabled/outroCardEnabled in AppState; remove force-unwraps | A3 | 2026-06-24 |
| #34 | Fix: use Haiku for iOS frame scoring instead of Sonnet (B2/B4) | B2/B4 | 2026-06-24 |
| #33 | Housekeeping: update loop state for Run 7 | meta | 2026-06-24 |
| #32 | Add Terms of Use + Support pages; fix inaccurate web metadata (D3) | D3 | 2026-06-24 |
| #31 | Fix StoreKit entitlement sync to AppState at launch and restore (C1/C2) | C1/C2 | 2026-06-24 |
| #28 | Add CLAUDE_VALIDATOR cost metering to ai-models.ts (B2) | B2 | 2026-06-24 |
| #26 | Fix iOS: update Sonnet model ID + unblock main thread in voice clone | A3 | 2026-06-24 |
| #25 | Fix CLAUDE_PLANNER to valid model ID claude-opus-4-8 | B2 | 2026-06-24 |
| #24 | Housekeeping: update loop state for Run 4 | meta | 2026-06-24 |
| #23 | Remove force-unwrap on baseAddress in AudioFeatureService FFT pack | A3 | 2026-06-24 |
| #22 | Fix AppStoreMetadata.swift false on-device/no-upload claims | D4 | 2026-06-24 |
| #20 | Fix Swift 6 strict-concurrency error in StoreKitService | A3 | 2026-06-24 |
| #19 | Cap base frame extraction per video to 120 frames | B2 | 2026-06-24 |
| #18 | Housekeeping: update loop state for Run 2 | meta | 2026-06-24 |
| #17 | Add per-call cost metering for all Claude API calls | B2 | 2026-06-24 |
| #15 | Make iOS CI green via SwiftPM test target | A1 | 2026-06-24 |
| #14 | Add housekeeping docs: IMPROVEMENT_LOG, PENDING_OPS, LOOP_MEMORY | meta | 2026-06-24 |
| #13 | Remove fatalError crash in UserAccountService init | A3 | 2026-06-24 |
| #12 | Honest privacy policy with third-party API disclosure | D1 | 2026-06-24 |
| #11 | Centralize AI model IDs in ai-models.ts | B4 | 2026-06-24 |
| #10 | Add cost-optimized model selection mandate + MODEL_COSTS.md | B4 | 2026-06-24 |
| #9 | Add CI status badge to README | meta | 2026-06-24 |
| #8 | iOS/web feature parity: validation loop, photo animation, production plan | A + B1 | 2026-06-24 |
| #7 | Enhance frame scoring, photo handling, export pipeline | B1 + B2 | 2026-03-19 |
| #6 | Validation loop with Haiku review + targeted asset regeneration | B1 | 2026-03-15 |
| #5 | Merge | — | 2026-03-08 |
| #4 | Fix SFX rate limiting; auto-retry rejected music prompts | B1 | 2026-03-08 |
| #3 | Add photo animation (Kling) + AI music generation (ElevenLabs) | A2 + B1 | 2026-03-07 |
| #2 | Add cloud-first AI effect recommendation + unified tape planning | A2 + B1 | 2026-03-05 |
| #1 | Add Highlight Magic MVP (iOS + web) | all | 2026-02-23 |

## Pending (open PRs — not yet logged; add to table above once merged)
- PR #16: A1 iOS CI destination fix — DO NOT MERGE (edits .github/ + Swift syntax bug; needs owner close)
- PR #84: CLOSED Run 18 (replaced by PR #100)
- PR #88: CLOSED Run 18 (logic incorporated into PR #101)
- PR #91: meta Run 16 housekeeping — pending CI merge
- PR #97: CLOSED Run 18 (stale; replaced by PR #103)
- PR #100: P0 ios-validate rescue (Run 18) — pending CI merge
- PR #101: Track H security hardening (Run 18) — pending CI merge
- PR #102: H6 security headers (Run 18) — pending CI merge
- PR #103: meta Run 18 housekeeping — pending CI merge
