# Loop Memory

State the autonomous factory carries across runs. Updated each housekeeping PR.
Read every run BEFORE selecting work.

## Last run: 2026-06-24 (Run 2)

### What was shipped (open PRs, pending CI merge)
- PR #16: `claude/a1-ci-destination` — A1 iOS CI destination fix (drop `OS=latest`)
- PR #17: `claude/b2-cost-metering` — per-call cost metering for all 3 Claude call sites (B2)

### What merged before this run
- PR #15: A1 iOS CI green via SwiftPM test target
- PR #14: Housekeeping docs (IMPROVEMENT_LOG, PENDING_OPS, LOOP_MEMORY)
- PR #13: Remove fatalError in UserAccountService init (A3 partial)
- PR #12: Honest privacy policy — third-party API disclosure (D1)
- PR #11: Centralize AI model IDs in ai-models.ts (B4 partial)
- PR #10: MODEL_COSTS.md + B4 mandate
- PRs #1–9: MVP + major feature waves

### Known blockers / recurring issues

**A1 (iOS CI) — PARTIALLY DONE, final validation pending**
- PR #15 added SwiftPM test target; #16 (open) fixes the CI destination string
- Once #16 merges and `ios` job is green, promote `ios` to required check

**P0 (cost + entitlement architecture) — NOT STARTED**
- iOS app calls `api.anthropic.com` directly via `ClaudeVisionService`
- Free quota is enforced client-side only (UserDefaults) — bypassable by reinstall
- Owner must decide: BYOK vs business-paid (see PENDING_OPS.md)
- Cannot implement server-side routing without knowing owner's intent

**B3 (server-side quota) — NOT STARTED**
- Requires Vercel KV; owner must provision it (see PENDING_OPS.md)
- No database means any "server-side" check is stateless and bypassable

### ROADMAP box status (verified against git + PRs as of 2026-06-24)
- [ ] P0 — not started
- [x] A1 — done in #15 + #16 (CI destination fix pending merge)
- [ ] A2 — substantially done in PRs #1–#8 (needs verification pass)
- [ ] A3 — partial: fatalError removed (#13); broader crash/concurrency audit needed
- [ ] A4 — not started
- [ ] A5 — not started
- [ ] B1 — substantially done in PRs #3–#8 (needs live-env reliability pass)
- [ ] B2 — partial: cost metering added (#17 pending); payload discipline + cache audit pending
- [ ] B3 — not started (needs Vercel KV)
- [ ] B4 — partial: MODEL_COSTS.md (#10) + model config map (#11) done; benchmarks pending
- [ ] C1 — not started (StoreKit exists but no server verification)
- [ ] C2 — not started (paywall UI exists; freemium logic partial)
- [x] D1 — honest privacy policy (#12); PrivacyInfo.xcprivacy not yet created
- [ ] D2 — partially done (deleteAllData exists in UserAccountService)
- [ ] D3 — not started (no screenshots, ASO copy, or preview video)
- [ ] D4 — not started
- [ ] E1 — not started (landing page skeleton exists in web/)
- [ ] Evals — not started

### What NOT to re-do
- Do not re-add MODEL_COSTS.md (done in #10)
- Do not re-add CI badge to README (done in #9)
- Do not write another privacy policy — D1 done in #12
- Do not re-centralize model IDs — done in #11
- Do not re-add cost metering — done in #17 (pending merge)
- Do not try to add a BYOK UI until P0 intent is confirmed

### Next priorities (by ROADMAP order)
1. **P0**: get owner's decision on BYOK vs business-paid; start routing or documenting
2. **A1** continued: confirm #16 merged and `ios` CI green; promote to required check
3. **A3** continued: broader crash/concurrency audit (force-unwraps on init paths, @MainActor audit)
4. **B2** continued: payload discipline (cap frame count, downscale), detection-cache + asset-cache audit
5. **B4**: web-search cheaper hosted/OSS models; run quality benchmark; add decision log entries
6. **C1/C2**: StoreKit server verification + paywall polish (once P0 resolved)
7. **D2**: confirm PrivacyInfo.xcprivacy exists; if not, create it
8. **D3**: App Store assets (screenshots, ASO copy, preview video)

### Runner constraints
- This factory runs on Linux — cannot run `xcodebuild`, `simctl`, or iOS simulator
- iOS changes must be validated by the macOS CI runner (non-blocking `ios` job)
- Do not merge iOS-only changes that fail the `ios` CI job
- Web changes are fully verifiable locally: `npm test` + `npm run build`
