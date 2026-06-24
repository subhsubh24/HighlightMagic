# Improvement Log

Tracks every change merged to `main` by the autonomous factory loop.
Format: newest first. Only MERGED changes appear here.

| PR | Title | Track | Merged |
|---|---|---|---|
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
