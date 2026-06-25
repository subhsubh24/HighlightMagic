# Improvement Log

Tracks every change merged to `main` by the autonomous factory loop.
Format: newest first. Only MERGED changes appear here.

| PR | Title | Track | Merged |
|---|---|---|---|
| #67 | test(G2): add route tests for /api/validate and /api/waitlist (12 tests) | G2 | pending #67 |
| #66 | feat(B3): add Vercel KV-backed quota store; wire into getQuotaStore() | B3 | pending #66 |
| #65 | test(G2): add coverage for post-processing pure functions (28 tests) | G2 | pending #65 |
| #64 | test(G2): add coverage for ai-models cost estimation (17 tests) | G2 | pending #64 |
| #63 | test(G2): add Vitest coverage thresholds (lines/functions/branches ≥60/60/50%) | G2 | pending #63 |
| #62 | security: patch Vitest CRITICAL CVE + Vite HIGH CVEs via npm audit fix | security | pending #62 |
| #61 | P0: add entitlement gate to all 8 remaining ungated paid API routes | P0/B3 | pending #61 |
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
