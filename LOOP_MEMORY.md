# Loop Memory

State the autonomous factory carries across runs. Updated each housekeeping PR.
Read every run BEFORE selecting work.

## Last run: 2026-06-24 (Run 1 — first factory run)

### What was shipped (open PRs, pending CI merge)
- PR #11: `claude/b4-model-config-map` — centralized AI model IDs in `web/src/lib/ai-models.ts`
- PR #12: `claude/d1-privacy-update` — honest privacy policy (third-party API disclosure)
- PR #13: `claude/a3-remove-fatalerror` — removed fatalError in UserAccountService init

### What merged before this run
- PR #10: MODEL_COSTS.md docs + B4 mandate
- PR #9: CI badge in README
- PR #8: iOS/web feature parity (validation loop, photo animation, production plan)
- PRs #1–7: MVP + major feature waves

### Known blockers / recurring issues

**A1 (iOS CI green) — HARD BLOCKER, not yet started**
- `HighlightMagic.xcodeproj/project.pbxproj` has `targets = ()` — no buildable targets
- All `xcodebuild -scheme HighlightMagic ...` calls fail with "no scheme"
- The factory runs on Linux; cannot run xcodebuild locally. Any A1 attempt must push to
  a branch and let the macOS CI runner validate it.
- Risk: pbxproj is complex; creating a full target from scratch is error-prone without
  local verification. Mitigation: file-system-synchronized groups (Xcode 15+) reduce the
  blast radius.
- Until A1 is fixed, iOS changes merge without iOS CI validation.

**P0 (cost + entitlement architecture) — NOT STARTED**
- iOS app calls `api.anthropic.com` directly via `ClaudeVisionService` with a key from
  Keychain/env/Info.plist
- Free quota is enforced client-side only (UserDefaults) — bypassable by reinstall
- Owner must decide: BYOK vs business-paid (see PENDING_OPS.md)
- Cannot implement server-side routing without knowing owner's intent

**B3 (server-side quota) — NOT STARTED**
- Requires Vercel KV; owner must provision it (see PENDING_OPS.md)
- No database means any "server-side" check is stateless and bypassable

### ROADMAP box status (verified against git)
- [ ] P0 — not started
- [ ] A1 — not started (pbxproj has no targets)
- [ ] A2 — substantially done in PRs #1-#8 (needs verification pass)
- [ ] A3 — PR #13 pending (fatalError removed; more crash risks may exist)
- [ ] A4 — not started
- [ ] A5 — not started
- [ ] B1 — substantially done in PRs #3-#8 (needs live-env reliability pass)
- [ ] B2 — partially done (caches exist; payload discipline added; cost metering pending)
- [ ] B3 — not started (needs Vercel KV)
- [ ] B4 — partially done: MODEL_COSTS.md (#10) + model config map (#11 pending); benchmarks pending
- [ ] C1 — not started (StoreKit exists but no server verification)
- [ ] C2 — not started (paywall UI exists; freemium logic partial)
- [ ] D1 — PR #12 pending (privacy policy); PrivacyInfo.xcprivacy not created
- [ ] D2 — partially done (deleteAllData exists in UserAccountService)
- [ ] D3 — not started (no screenshots, ASO copy, or preview video)
- [ ] D4 — not started
- [ ] E1 — not started (landing page skeleton exists in web/)
- [ ] Evals — not started

### What NOT to re-do
- Do not re-add MODEL_COSTS.md (done in #10)
- Do not re-add CI badge to README (done in #9)
- Do not write another privacy policy — D1 pending in #12
- Do not try to add a BYOK UI until P0 intent is confirmed

### Next priorities (by ROADMAP order)
1. **P0**: get owner's decision on BYOK vs business-paid; start routing or documenting
2. **A1**: fix Xcode project (add targets + shared scheme) — biggest unblock for iOS CI
3. **B3**: implement server-side quota once Vercel KV is provisioned
4. **A3** continued: search for other crash risks (fatalError, force-unwraps on init paths)
5. **C1/C2**: StoreKit server verification + paywall polish

### Runner constraints
- This factory runs on Linux — cannot run `xcodebuild`, `simctl`, or iOS simulator
- iOS changes must be validated by the macOS CI runner (non-blocking `ios` job)
- Do not merge iOS-only changes that fail the `ios` CI job (check CI status after push)
- Web changes are fully verifiable locally: `npm test` + `npm run build`
