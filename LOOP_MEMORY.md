# Loop Memory

State the autonomous factory carries across runs. Updated each housekeeping PR.
Read every run BEFORE selecting work.

## Last run: 2026-06-24 (Run 3)

### What was shipped (merged this run)
- PR #19: `claude/b2-frame-cap` — cap base frames per video to 120 (adaptive interval); prevents runaway API cost on long videos (B2)
- PR #20: `claude/a3-storekit-concurrency` — mark `checkVerified` nonisolated; fixes Swift 6 strict-concurrency error in `StoreKitService.listenForTransactions` Task.detached (A3)

### Incomplete work from this run
- **D4 AppStoreMetadata accuracy** (`claude/d4-description-accuracy`): Branch exists but was NOT PR'd.
  - Hit 2-cycle review cap; Reviewer A approved final state, Reviewer B had a new finding each cycle.
  - File moved: `Sources/Resources/AppStoreMetadata.swift` → `Sources/Utilities/AppStoreMetadata.swift` (in PR #18), so the branch changes target the old path and cannot be merged as-is.
  - ACTION FOR NEXT RUN: Re-apply these changes to `Sources/Utilities/AppStoreMetadata.swift`:
    1. description: remove "powered by on-device AI" → "powered by AI"; remove "No cloud uploads."
    2. PRIVACY-FIRST section: replace false "videos never leave your phone" claim with accurate BYOK disclosure
    3. whatsNew: remove "on-device" qualifier from highlight detection bullet
    4. reviewNotes AI DISCLOSURE: reword to say "on-device by default; when BYOK key configured, ~1fps frames sent to Anthropic"
    5. screenshot #8 screenContent: reference "AI Settings section showing optional API key field" instead of non-existent banner

### Known blockers / recurring issues

**PR #16 — DANGEROUS, DO NOT INTERACT**
- Branch: `claude/a1-ci-destination`
- This PR edits `.github/workflows/ci.yml` (BLAST RADIUS violation) AND has a Swift syntax bug
  (`AIEffectRecommendationService.swift` missing `}`) that breaks compilation.
- Do not merge, do not fix, do not comment. Recommend owner close it manually.

**A1 (iOS CI) — PARTIALLY DONE**
- PR #15 added SwiftPM test target; PR #16 attempts destination fix but is broken/off-limits.
- Current `ios` CI job uses `OS=latest` which may cause "simulator not found" errors.
- `ios` is NON-BLOCKING — merges proceed without iOS CI green.
- Do NOT attempt to re-fix the CI destination (requires editing `.github/` — BLAST RADIUS).
- Consider A1 done for now unless the `ios` CI consistently fails on new iOS-only PRs.

**P0 (cost + entitlement architecture) — NOT STARTED**
- iOS app calls `api.anthropic.com` directly via `ClaudeVisionService` (BYOK model confirmed by AppStoreMetadata)
- The BYOK model is intentional — users provide their own API keys
- Free quota is enforced client-side only (UserDefaults) — bypassable by reinstall
- Server-side quota would still be valuable for the web/ backend (B3)

**B3 (server-side quota) — NOT STARTED**
- Requires Vercel KV; owner must provision it (see PENDING_OPS.md)
- No database means any "server-side" check is stateless and bypassable

### ROADMAP box status (verified against git + PRs as of 2026-06-24 Run 3)
- [ ] P0 — not started (BYOK model confirmed; P0 bullets about business-paid routing don't apply)
- [x] A1 — iOS CI green via SwiftPM (#15); destination issue minor; mark done
- [ ] A2 — substantially done in PRs #1–#8 (needs verification pass)
- [ ] A3 — partial: fatalError removed (#13), StoreKit concurrency fixed (#20); broader audit needed
- [ ] A4 — not started
- [ ] A5 — not started
- [ ] B1 — substantially done in PRs #3–#8 (needs live-env reliability pass)
- [ ] B2 — partial: cost metering (#17), frame cap (#19), model selection (ai-models.ts/#11); payload downscaling + cache audit pending
- [ ] B3 — not started (needs Vercel KV)
- [ ] B4 — partial: MODEL_COSTS.md (#10) + model config map (#11) done; benchmarks pending
- [ ] C1 — not started (StoreKit exists but no server verification)
- [ ] C2 — not started (paywall UI exists; freemium logic partial)
- [x] D1 — honest privacy policy (#12); PrivacyInfo.xcprivacy EXISTS at Sources/Resources/ (PENDING_OPS was wrong)
- [ ] D2 — partial: SettingsView.swift has full Delete Account UI; verify it's wired to actual data deletion
- [ ] D3 — not started (no screenshots, ASO copy, or preview video)
- [ ] D4 — not started: AppStoreMetadata.swift still has false claims (see "Incomplete work" above)
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
- Do not create a new BYOK Settings UI — the app already uses BYOK (ClaudeVisionService reads key from Keychain)

### Next priorities (by ROADMAP order)
1. **D4** (HIGH): fix AppStoreMetadata.swift false claims (see "Incomplete work" above; apply to new path `Sources/Utilities/`)
2. **A3** continued: broader Swift 6 audit — search for force-unwraps on init paths, other `Task.detached` + `@MainActor` call-site issues
3. **B2** continued: payload discipline — downscale frames before sending to Anthropic API; asset-cache + detection-cache audit
4. **D2**: verify SettingsView `deleteAccountData()` actually wipes all storage (UserDefaults, Keychain, iCloud, local files)
5. **D3**: App Store assets (screenshots, ASO copy, preview video) — unblocked once D4 description is accurate
6. **B3**: server-side quota (requires Vercel KV — see PENDING_OPS.md)
7. **C1/C2**: StoreKit server verification + paywall polish

### Runner constraints
- This factory runs on Linux — cannot run `xcodebuild`, `simctl`, or iOS simulator
- iOS changes must be validated by the macOS CI runner (non-blocking `ios` job)
- Do not merge iOS-only changes that fail the `ios` CI job
- Web changes are fully verifiable locally: `npm test` + `npm run build`
