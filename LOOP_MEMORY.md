# Loop Memory

State the autonomous factory carries across runs. Updated each housekeeping PR.

Read every run BEFORE selecting work.

## Last run: 2026-06-24 (Run 6)

### What was shipped (merged this run)
- **PR #25** (B2): Fix `CLAUDE_PLANNER` from invalid `claude-opus-4-6` to `claude-opus-4-8`; correct Opus-tier pricing ($15/$75/M) in cost-metering logs
- **PR #26** (A3): Fix `ClaudeVisionService` model ID (`claude-sonnet-4-20250514` → `claude-sonnet-4-6`); fix blocking `Data(contentsOf:)` in ProcessingView voice-clone path with `Task.detached`

### PRs opened this run (pending merge)
- **PR #28** (`claude/b2-validator-pricing`): B2 — Correct Haiku 4.5 price in `MODEL_PRICES_USD_PER_MILLION` from `1.0/5.0` to actual `0.80/4.00` per M tokens; auto-merge enabled; CI re-triggered after fixing duplicate-key build error

### PRs closed without merging this run
- **PR #29** (`claude/b3-quota-api`): B3 quota API routes — closed by factory. Reviewer A flagged 3 critical issues (isProUser bypass, TOCTOU race, attacker-controlled userId) that cannot be fixed without a server-side auth layer. The `quota.ts` library and tests in this PR remain valid infrastructure for when auth is added. See PENDING_OPS.md.

### Known blockers / recurring issues

**PR #16 — DANGEROUS, DO NOT INTERACT**
- Branch: `claude/a1-ci-destination`
- Edits `.github/workflows/ci.yml` (BLAST RADIUS violation) AND has a Swift syntax bug (`AIEffectRecommendationService.swift` missing `}`) that breaks compilation.
- Do not merge, do not fix, do not comment. Recommend owner close it manually.

**A1 (iOS CI) — SUBSTANTIALLY DONE**
- PR #15 added SwiftPM test target; PR #16 attempts destination fix but is broken/off-limits.
- `ios` is NON-BLOCKING — merges proceed without iOS CI green.
- Do NOT attempt to re-fix the CI destination (requires editing `.github/` — BLAST RADIUS).

**P0 (cost + entitlement architecture) — BYOK model confirmed**
- iOS app calls `api.anthropic.com` directly via `ClaudeVisionService` (BYOK model confirmed)
- The BYOK model is intentional — users provide their own API keys
- Free quota is enforced client-side only (UserDefaults) — bypassable by reinstall
- Server-side quota (B3) requires BOTH Vercel KV AND an auth layer before it is meaningful

**B3 (server-side quota) — BLOCKED: needs auth layer + Vercel KV**
- Any `/api/quota/*` endpoint is trivially bypassable without server-verified identity
- The `isProUser` flag must come from a verified session token, not the request body
- Requires an auth provider (Clerk, Supabase Auth, or similar) before quota routes make sense
- After auth is added: re-use `quota.ts` library from the closed PR #29 branch (`claude/b3-quota-api`)
- Owner must also provision Vercel KV (see PENDING_OPS.md)

### ROADMAP box status (verified against git + PRs as of 2026-06-24 Run 6)
- [ ] P0 — BYOK model confirmed; P0 "business-paid routing" bullets don't apply; B3 still needed
- [x] A1 — iOS CI green via SwiftPM (#15); destination issue minor; treat as done
- [ ] A2 — substantially done in PRs #1–#8 (needs verification pass)
- [ ] A3 — partial: fatalError removed (#13), StoreKit concurrency fixed (#20), baseAddress! fixed (#23), model ID + blocking-read fix merged (#26); more Swift 6 / sendability gaps may remain
- [ ] A4 — not started
- [ ] A5 — not started
- [ ] B1 — substantially done in PRs #3–#8 (needs live-env reliability pass)
- [ ] B2 — partial: cost metering (#17), frame cap (#19), model selection (#11), CLAUDE_PLANNER valid ID (#25), Haiku price correction (PR #28 pending merge)
- [ ] B3 — BLOCKED: needs auth layer before quota routes are meaningful (see PENDING_OPS.md)
- [ ] B4 — partial: MODEL_COSTS.md (#10) + model config map (#11) done; benchmarks pending
- [ ] C1 — not started (StoreKit exists but no server verification)
- [ ] C2 — not started (paywall UI exists; freemium logic partial)
- [x] D1 — honest privacy policy (#12); PrivacyInfo.xcprivacy EXISTS at Sources/Resources/
- [ ] D2 — deleteAccountData() covers: projects, iCloud, thumbnails, user ID, Anthropic key; treat as substantially done pending D3
- [ ] D3 — not started (no screenshots; ASO copy in AppStoreMetadata.swift improved via #22; screenshots + preview video need device/simulator — owner task)
- [x] D4 — COMPLETE: PR #22 merged; all 4 false on-device/no-upload claims removed from description, PRIVACY-FIRST section, whatsNew, screenshot #8
- [ ] E1 — not started (landing page skeleton exists in web/)
- [ ] Evals — not started

### What NOT to re-do
- Do not re-add MODEL_COSTS.md (done in #10)
- Do not re-add CI badge to README (done in #9)
- Do not write another privacy policy — D1 done in #12
- Do not re-centralize model IDs — done in #11
- Do not re-add cost metering — done in #17
- Do not re-add frame cap — done in #19
- Do not re-fix StoreKit concurrency — done in #20
- Do not re-fix AppStoreMetadata false claims — D4 COMPLETE via #22
- Do not re-fix AudioFeatureService baseAddress! — done in #23
- Do not re-fix CLAUDE_PLANNER model ID — done in #25
- Do not re-fix ClaudeVisionService model ID or ProcessingView blocking read — done in #26
- Do not re-add frame downscaling (480p JPEG 0.6 already in frame-extractor.ts)
- Do not re-cap validation loop (already at 2 passes in DetectingStep.tsx)
- Do not create a new BYOK Settings UI — the app already uses BYOK
- Do not create B3 quota endpoints without first adding an auth layer

### Next priorities (by ROADMAP order)
1. **Verify #28 merged** — if still open after CI, investigate; should auto-merge once web CI passes
2. **A3 remaining** — scan remaining Swift files for blocking calls, force-unwraps, Swift 6 sendability gaps not yet addressed
3. **C1/C2** — StoreKit server verification + paywall polish
4. **D3** — ASO copy improvements reviewable on Linux; screenshots require device (owner task)
5. **B3 + auth** — add auth provider first, then re-implement quota routes using quota.ts from closed PR #29 branch

### Runner constraints
- This factory runs on Linux — cannot run `xcodebuild`, `simctl`, or iOS simulator
- iOS changes must be validated by the macOS CI runner (non-blocking `ios` job)
- Do not merge iOS-only changes that fail the `ios` CI job
- Web changes are fully verifiable locally: `npm test` + `npm run build`
