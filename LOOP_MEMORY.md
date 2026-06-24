# Loop Memory

State the autonomous factory carries across runs. Updated each housekeeping PR.

Read every run BEFORE selecting work.

## Last run: 2026-06-24 (Run 4)

### What was shipped (merged this run)
- Nothing merged yet — PRs #22 and #23 opened; pending `web` CI (expected to pass, iOS-only changes)

### PRs opened this run (pending merge)
- **PR #22** (`claude/d4-appstoredescription`): D4 — Fix AppStoreMetadata.swift false claims
  - Removes 4 false on-device/no-upload claims from App Store copy
  - Fixes: description "powered by on-device AI", "No cloud uploads"; PRIVACY-FIRST section; whatsNew bullet; screenshot #8
  - Reviewer A + B both APPROVED
- **PR #23** (`claude/a3-audio-baseaddress`): A3 — Remove `baseAddress!` force-unwrap in AudioFeatureService
  - `guard let base = ptr.baseAddress else { return }` replaces `ptr.baseAddress!` in FFT pack step
  - Reviewer A + B both APPROVED

### Incomplete work from this run
- None — both changes from this run are well-defined and in open PRs

### Known blockers / recurring issues

**PR #16 — DANGEROUS, DO NOT INTERACT**
- Branch: `claude/a1-ci-destination`
- This PR edits `.github/workflows/ci.yml` (BLAST RADIUS violation) AND has a Swift syntax bug
  (`AIEffectRecommendationService.swift` missing `}`) that breaks compilation.
- Do not merge, do not fix, do not comment. Recommend owner close it manually.

**A1 (iOS CI) — SUBSTANTIALLY DONE**
- PR #15 added SwiftPM test target; PR #16 attempts destination fix but is broken/off-limits.
- `ios` is NON-BLOCKING — merges proceed without iOS CI green.
- Do NOT attempt to re-fix the CI destination (requires editing `.github/` — BLAST RADIUS).

**P0 (cost + entitlement architecture) — BYOK model confirmed**
- iOS app calls `api.anthropic.com` directly via `ClaudeVisionService` (BYOK model confirmed)
- The BYOK model is intentional — users provide their own API keys
- Free quota is enforced client-side only (UserDefaults) — bypassable by reinstall
- Server-side quota (B3) still valuable but requires Vercel KV (owner must provision it)

**B3 (server-side quota) — NOT STARTED**
- Requires Vercel KV; owner must provision it (see PENDING_OPS.md)
- No database means any "server-side" check is stateless and bypassable

### ROADMAP box status (verified against git + PRs as of 2026-06-24 Run 4)
- [ ] P0 — BYOK model confirmed; P0 "business-paid routing" bullets don't apply; B3 still needed
- [x] A1 — iOS CI green via SwiftPM (#15); destination issue minor; treat as done
- [ ] A2 — substantially done in PRs #1–#8 (needs verification pass)
- [ ] A3 — partial: fatalError removed (#13), StoreKit concurrency fixed (#20), baseAddress! fixed (PR #23 pending)
- [ ] A4 — not started
- [ ] A5 — not started
- [ ] B1 — substantially done in PRs #3–#8 (needs live-env reliability pass)
- [ ] B2 — partial: cost metering (#17), frame cap (#19), model selection (#11), 480p downscaling (already in frame-extractor.ts); validation loop capped at 2 passes (already in DetectingStep.tsx)
- [ ] B3 — not started (needs Vercel KV)
- [ ] B4 — partial: MODEL_COSTS.md (#10) + model config map (#11) done; benchmarks pending
- [ ] C1 — not started (StoreKit exists but no server verification)
- [ ] C2 — not started (paywall UI exists; freemium logic partial)
- [x] D1 — honest privacy policy (#12); PrivacyInfo.xcprivacy EXISTS at Sources/Resources/
- [ ] D2 — deleteAccountData() covers: projects, iCloud, thumbnails, user ID, Anthropic key; no ElevenLabs key in Settings UI so no gap; treat as substantially done pending D4 + D3
- [ ] D3 — not started (no screenshots, ASO copy drafted in AppStoreMetadata.swift; screenshots + preview video need device/simulator)
- [ ] D4 — PR #22 pending CI; once merged, description/whatsNew/screenshot #8 false claims will be fixed; remaining: reviewNotes already accurate, keywords/promotional unchanged
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
- Do not re-fix AppStoreMetadata false claims — PR #22 pending (will be done once merged)
- Do not re-fix AudioFeatureService baseAddress! — PR #23 pending (will be done once merged)
- Do not re-add frame downscaling (480p JPEG 0.6 already in frame-extractor.ts)
- Do not re-cap validation loop (already at 2 passes in DetectingStep.tsx)
- Do not create a new BYOK Settings UI — the app already uses BYOK

### Next priorities (by ROADMAP order)
1. **Verify #22/#23 merged** — if still open, investigate CI; they pass web gate (iOS-only changes)
2. **B2 audit**: asset-cache and detection-cache are both implemented and look solid; check if `CLAUDE_PLANNER` model ID `claude-opus-4-6` is a valid Anthropic API model (might be outdated — research before changing)
3. **A3 broader**: remaining force-unwraps or Swift 6 issues in ProcessingView, ExportView, etc.
4. **D3**: App Store assets — keywords/promotional text in AppStoreMetadata.swift look good once D4 merges; screenshots require device/simulator (owner task); can draft ASO copy improvements
5. **B3**: server-side quota (requires Vercel KV — see PENDING_OPS.md)
6. **C1/C2**: StoreKit server verification + paywall polish

### Runner constraints
- This factory runs on Linux — cannot run `xcodebuild`, `simctl`, or iOS simulator
- iOS changes must be validated by the macOS CI runner (non-blocking `ios` job)
- Do not merge iOS-only changes that fail the `ios` CI job
- Web changes are fully verifiable locally: `npm test` + `npm run build`
