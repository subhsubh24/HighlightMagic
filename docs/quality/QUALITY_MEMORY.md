# HighlightMagic — Quality Auditor Memory

Append-only log of independent quality grades (maker ≠ checker). Read FIRST each run; diff vs the last
grade. The auditor writes ONLY this file + `QUALITY_RUBRIC.md` + `QUALITY_SCORECARD.md`; it never writes
product code and never fixes what it finds (the factory fixes; the auditor files issues).

---

## 2026-06-29 — first grade (bootstrap), commit a9fe560

**Bootstrap run.** `docs/quality/` did not exist; created `QUALITY_RUBRIC.md` (9 dimensions, adapted to
the iOS-app + Next.js-backend stack) and this scorecard. Graded with 9 fresh, adversarial per-dimension
subagents (none wrote the code), each backing its letter with a mechanical signal it ran + file/line
evidence. Re-ran the web gate this run: `npm ci && build && test && lint` → build ok, **617 tests passed
(50 files)**, **0 lint warnings**; latest main CI (web, web-lint, web-e2e, ios) green on a9fe560.

**Grades:** overall **B**; `ship_gate_met = false`.

| Dimension | ship_critical | Grade |
|---|:---:|:---:|
| functional_reality | ✅ | B |
| correctness_reliability | ✅ | C |
| security | ✅ | A |
| design_taste | ✅ | A |
| store_readiness | ✅ | C |
| artifact_integrity | ✅ | B |
| business_case_strength | ✅ | A |
| tests_evals | ✅ | B |
| performance | ⬜ | B |

**Ship gate NOT met:** needs A/A+ on every ship-critical dim; `correctness_reliability` and
`store_readiness` are C (below the ship bar).

**Auditor override (recorded for transparency):** the artifact-integrity grader subagent returned **F**,
reasoning from "all DoD boxes unchecked + QUALITY_SCORECARD.md missing." I overrode to **B**: unchecked
DoD boxes are the loop being *honest* it isn't done (not an integrity failure), and the missing scorecard
is exactly what this bootstrap run creates. Its substantive findings (25 sampled ticked boxes all backed by
real artifacts; pricing/privacy/analytics consistent) support a good grade. The one genuine integrity
defect — README/BUSINESS_CASE present a server-side AI model while the iOS services carry direct-provider
key paths — is a *named non-blocking gap* = B.

**Top gaps to drive to A+ (ordered; filed as issues):**
1. `store_readiness` C — iOS ElevenLabs/AtlasCloud direct-provider key paths (App Store credential risk +
   bypasses the server-side gate); stubbed ASO assets; under-declared privacy manifest.
2. `correctness_reliability` C — poll-manager duplicate-predictionId callback race; StoreKitService
   `nonisolated(unsafe)` Task; unguarded AI-response array access.
3. `functional_reality` B — no outcome-asserting iOS export journey test; free-export quota client-side
   on iOS (reset by reinstall).
4. `tests_evals` B — eval suite not CI-scheduled/gated; coverage thresholds defined but unenforced
   (provider not installed); elevenlabs-* provider modules untested.
5. `artifact_integrity` B — reconcile docs' server-side framing with the iOS direct-provider capability.

**Diff vs last grade:** n/a (first grade — baseline established).

---

## 2026-07-01 — second grade, commit bff8d15

Re-ran the web gate this run: `npm ci && build && test && lint` → build ok, **694 tests passed (55 files)**
(up from 617/50), **0 lint warnings**. Graded with 9 fresh, adversarial per-dimension subagents (none wrote
the code), each backing its letter with a mechanical signal it ran + file/line evidence. `@vitest/coverage-v8`
still not installed (coverage floors unenforced) — confirmed by re-running.

**Grades:** overall **B**; `ship_gate_met = false`.

| Dimension | ship_critical | Grade | Δ vs 2026-06-29 |
|---|:---:|:---:|:---:|
| functional_reality | ✅ | B | = |
| correctness_reliability | ✅ | **A** | **C → A ↑↑** |
| security | ✅ | A | = (both to-A+ blockers closed; new cross-instance residual holds it at A) |
| design_taste | ✅ | A | = (to-A+ Animate glass-card done; mobile screenshots remain) |
| store_readiness | ✅ | C | = (2/3 blockers closed; app-target + screenshots block) |
| artifact_integrity | ✅ | **A** | **B → A ↑** |
| business_case_strength | ✅ | A | = (Section-5 reconciliation landed) |
| tests_evals | ✅ | B | = (provider tests added; coverage + eval gaps remain) |
| performance | ⬜ | B | = |

**What changed (real, verified):**
- **correctness_reliability C → A:** all three named defects fixed WITH passing regression tests — poll-manager
  now fans out to a `waiters[]` array (#179, poll-manager.test.ts:120/140, 10/10 pass); StoreKitService replaced
  `nonisolated(unsafe)` with a `@MainActor`/`Task.detached [weak self]` pattern; provider array access is
  length-guarded (atlascloud.ts:258).
- **artifact_integrity B → A:** the docs-vs-code contradiction closed — #180 hard-disabled the iOS
  direct-provider paths (`apiKey=nil`, `isAvailable=false`), so README/BUSINESS_CASE server-side framing is now
  true; the Swift headers proactively disclose the dormant paths.
- **security (held A):** both prior to-A+ blockers closed (iOS direct paths removed; quota store now Vercel-KV
  durable + fail-closed, #214). Reconciled DOWN from the subagent's A+ — a real cross-instance daily-ceiling /
  per-IP rate-limit residual (in-memory per-instance) is a named finding, so not zero-findings A+.
- **store_readiness (held C):** prior blockers 1 (embedded keys) & 3 (privacy manifest, #210) closed, but a
  hard submission blocker surfaced on scrutiny: **no archivable Xcode app target** (SwiftPM-only cannot produce
  an IPA) plus screenshots/preview still absent. This is the dimension keeping the ship gate false.

**Auditor reconciliations (recorded for transparency):**
- security: subagent returned **A+**; overrode to **A**. A+ requires zero findings / room to spare; the
  in-memory per-instance daily ceiling + IP rate-limit (only the monthly per-user quota is KV-atomic) is a
  genuine cross-instance enforcement residual on Vercel's fan-out — a named gap, so A, not A+.

**Ship gate NOT met:** needs A/A+ on every ship-critical dim; `store_readiness` (C), `functional_reality` (B),
`tests_evals` (B) are below the A bar.

**Top gaps (ordered; issues filed/updated):**
1. `store_readiness` C — no archivable Xcode app target (can't produce a submittable IPA); missing 6.9" screenshots + preview.
2. `functional_reality` B — no executing iOS export-to-file test; export-COUNT quota still client-side (reset by reinstall).
3. `tests_evals` B — coverage floor unenforced (@vitest/coverage-v8 absent); live-eval.yml covers only detection + passes green keyless.
4. `performance` B (non-ship-critical) — iOS thumbnail full-clear at 50; base64 frame transfer.

**Issues:** #175 (correctness) and #178 (artifact_integrity) closed — both re-graded A. #174 (store_readiness)
updated with the app-target/screenshots blockers. #176 (functional_reality), #177 (tests_evals) updated with
current evidence.

---

## 2026-07-03 — third grade, commit 709b3b7

Re-ran the web gate this run: `npm ci && test && lint && build` → **859 tests passed (68 files)** (up from 694/55),
coverage now ENFORCED and passing (v8: stmts 77.57 / branch 73.26 / funcs 81.87 / lines 78.49, all above the 60/60/50/60
floor), **0 lint warnings**, build ok. Required CI (web, web-lint, web-e2e, validate-capabilities, validate-gtm, ios)
green on 709b3b7 (latest main run: success). Graded with 9 fresh, adversarial per-dimension subagents (none wrote the
code), each backing its letter with a mechanical signal it ran + file/line evidence.

**Grades:** overall **B**; `ship_gate_met = false`.

| Dimension | ship_critical | Grade | Δ vs 2026-07-01 |
|---|:---:|:---:|:---:|
| functional_reality | ✅ | B | = (both iOS gaps unchanged for two cycles) |
| correctness_reliability | ✅ | A | = (atlascloud retry residual CLOSED; new credit-store non-atomic-grant residual) |
| security | ✅ | A | = (spend daily-ceiling → KV-atomic CLOSED; per-IP throttle in-memory holds it at A) |
| design_taste | ✅ | A | = (both to-A+ items — mobile screenshots, Turnstile aria-label — still open) |
| store_readiness | ✅ | C | = (both blockers open; new: consumable SKU absent from .storekit, placeholder team/app IDs) |
| artifact_integrity | ✅ | A | = (BUSINESS_CASE_SUMMARY namespace nit still open) |
| business_case_strength | ✅ | A | = (credit-pack lever now backend-built + tested; StoreKit consumable SKU still unshipped) |
| tests_evals | ✅ | B | = (coverage floor now ENFORCED — real lift; eval breadth + skip-green + no iOS roundtrip hold at B) |
| performance | ⬜ | B | = (both to-A residuals open two cycles) |

**What changed (real within-grade progress, no letter moved):**
- **tests_evals — coverage floor ENFORCED (the largest prior gap, closed).** `@vitest/coverage-v8` ^4.1.9 installed;
  `test` = `vitest run --coverage`; the required `web` CI job runs it; v8 thresholds hard-fail below 60/60/50/60. Held at
  **B** only because the eval suite still covers just Anthropic (ElevenLabs/AtlasCloud missing), live-eval.yml still
  skips-green when keyless (#289), and there's no iOS export roundtrip test.
- **security — spend daily-ceiling → KV-atomic + fail-closed** (spend-ceiling.ts:108-136), closing the spend half of the
  prior named residual. Held at **A** (not A+): the per-IP throttle is still in-memory per-instance
  (rate-limit.ts:28 `new Map`) — the other half of the SAME prior residual — a defense-in-depth (not wallet-drain) but
  real named finding.
- **correctness — atlascloud poll-fetch/timeout retry** (atlascloud.ts:253-266) now absorbs transient blips, closing the
  prior to-A+ item. A NEW low-severity residual is the successor: credit-store.ts:118-131 writes the SET-NX idempotency
  marker BEFORE incrby, so a mid-grant KV failure can silently lose a paid credit pack (safety-biased, never double-grants).
- **business_case — export-credit-pack now a tested, wired BACKEND lever** (credit-store.ts, redeemCreditPack,
  /api/credits/redeem, consumption in the export gate; 33 tests pass). Real advance from docs-only. Held at **A**: the
  StoreKit CONSUMABLE SKU is still absent (`products:[]`), so credits aren't user-purchasable and revenue can't flow.

**Auditor reconciliations (recorded for transparency):**
- security: subagent returned **A+**; overrode to **A**. The per-IP rate-limit in-memory piece was explicitly part of the
  2026-07-01 named residual ("rate-limit.ts and spend-ceiling.ts daily ceiling remain in-memory"); the spend half moved to
  KV but the rate-limit.ts half did not (verified: rate-limit.ts:28 `const buckets = new Map`). One named residual ⇒ not
  zero-findings A+. Not goalpost-moving — the item was named last cycle and remains open.
- tests_evals: subagent returned **B+**; our discrete scale has no B+ — mapped to **B**. Coverage enforcement is a genuine
  lift, but gap 2 is open on all three sub-parts, so the letter stays B.

**Ship gate NOT met:** needs A/A+ on every ship-critical dim; `store_readiness` (C), `functional_reality` (B),
`tests_evals` (B) are below the A bar.

**Top gaps (ordered; issues updated):**
1. `store_readiness` C — no archivable Xcode app target (can't produce a submittable IPA); missing 6.9" screenshots + preview; placeholder team/app IDs; consumable SKU absent from .storekit.
2. `functional_reality` B — no executing iOS export-to-file test; export-COUNT quota still client-side (reset by reinstall). Unchanged two cycles.
3. `tests_evals` B — coverage floor now enforced (closed); eval breadth (ElevenLabs/AtlasCloud missing) + skip-green keyless (#289) + no iOS export roundtrip remain.
4. `performance` B (non-ship-critical) — iOS thumbnail full-clear at 50; base64 frame transfer.

**Issues:** #174 (store_readiness), #176 (functional_reality), #177 (tests_evals) all still open — updated with
current evidence (esp. #177: coverage enforcement now CLOSED; remaining gaps are eval breadth + skip-green + iOS roundtrip).

---

## 2026-07-05 — fourth grade, commit 468dd02

Re-ran the web gate this run: `npm ci && test && lint && build` → **956 tests passed (71 files)** (up from 859/68),
coverage ENFORCED and passing (v8: stmts 91.65 / branch 82.51 / funcs 92.12 / lines 92.79, all above the 60/60/50/60
floor — a big lift from 77.57/73.26/81.87/78.49), **0 lint warnings**, build ok. Required CI (web, web-lint, web-e2e,
validate-capabilities, validate-gtm, ios) green on 468dd02 (latest main run: success). Graded with 9 fresh, adversarial
per-dimension subagents (none wrote the code), each backing its letter with a mechanical signal it ran + file/line evidence.

**Grades:** overall **B**; `ship_gate_met = false`.

| Dimension | ship_critical | Grade | Δ vs 2026-07-03 |
|---|:---:|:---:|:---:|
| functional_reality | ✅ | B | = (both iOS gaps unchanged three cycles) |
| correctness_reliability | ✅ | A | = (credit-grant now atomic Lua #350; new residual: atomicity only mock-proven) |
| security | ✅ | A | = (per-IP throttle still in-memory; wallet backstop KV-atomic) |
| design_taste | ✅ | A | = (CAPTCHA aria-label CLOSED #346; mobile screenshots still open) |
| store_readiness | ✅ | C | = (both blockers open three cycles; placeholder IDs + no consumable SKU) |
| artifact_integrity | ✅ | **A+** | **A → A+ ↑** (BUSINESS_CASE_SUMMARY key #345 closed; all 4 feeds parse; zero findings) |
| business_case_strength | ✅ | A | = (numbers reconcile; credit lever still half-shipped, no consumable SKU) |
| tests_evals | ✅ | B | = (coverage + low-file CLOSED; eval breadth/skip-green/iOS roundtrip remain) |
| performance | ⬜ | **A** | **B → A ↑** (thumbnail per-entry LRU #354; base64 finding non-binding) |

**What changed (real, verified):**
- **artifact_integrity A → A+:** the sole prior residual closed — #345 wrapped BUSINESS_CASE.md's summary under a real
  top-level `BUSINESS_CASE_SUMMARY:` key (col 0, not a comment); all four dashboard feeds now parse under one convention
  (python3+pyyaml verified). 8 sampled ticked boxes all back real wired artifacts; env manifest complete; docs honestly
  disclose what's not done. Zero findings ⇒ A+.
- **performance B → A:** #354 replaced ThumbnailService's cache.removeAll()-at-50 with proper per-entry LRU
  (ThumbnailService.swift:8-12 accessOrder array; :48-51 evict coldest) — residual (1) closed with code. Residual (2)
  (base64 frame transfer) reconciled as non-binding: the Anthropic Vision API requires base64 image blocks, and
  extraction+scoring share one JS context, so a Blob would just be re-encoded — the "33% overhead" framing doesn't bind.
- **correctness (held A):** #350 made the credit redeem+grant a single atomic KV Lua script (REDEEM_AND_GRANT_LUA),
  closing the prior SET-NX-before-INCRBY split-write race. New successor residual: the atomicity is proven only against a
  mock (credit-store.test.ts:116-129 says so explicitly); the deferred live-KV test holds it at A.
- **design_taste (held A):** #346 labeled the Turnstile CAPTCHA (role="group" aria-label), closing one to-A+ item; the
  mobile-viewport screenshots item (playwright single desktop chromium project) remains open.
- **tests_evals (held B):** coverage floor was already enforced; this cycle the two ship-critical low-coverage files were
  covered (frame-extractor 40.21→97.82%, audio-mux 8.52→99.22%, #322-#325) — a real lift. Held at B because eval breadth
  (ElevenLabs/AtlasCloud) is still absent ON MAIN (the G3 branch is queued in CI but not merged — not credited),
  live-eval.yml still skips-green keyless (#289), and no iOS export roundtrip test exists.

**Auditor reconciliations (recorded for transparency):**
- artifact_integrity: subagent returned A+; ACCEPTED. Verified independently the four-feed parse + no overclaim; honest
  disclosure of incomplete work is the opposite of an integrity failure.
- performance: subagent returned A (B→A); ACCEPTED. The residual (1) closure is code-verified; the residual (2) dismissal
  rests on a sound technical argument (Vision API base64 requirement), not hand-waving. Non-ship-critical, so no gate impact.
- correctness: subagent returned A with a named residual; kept A (no A+): the mock-only atomicity proof is a real gap.

**Ship gate NOT met:** needs A/A+ on every ship-critical dim; `store_readiness` (C), `functional_reality` (B),
`tests_evals` (B) are below the A bar — all unchanged for three cycles on the same root blockers.

**Top gaps (ordered; issues updated):**
1. `store_readiness` C — no archivable Xcode app target (Package.swift .library-only ⇒ no submittable IPA); missing 6.9" screenshots + preview; placeholder team/app IDs; consumable SKU absent from .storekit.
2. `functional_reality` B — no executing iOS export-to-file test; export-COUNT quota still client-side (reset by reinstall). Unchanged three cycles.
3. `tests_evals` B — coverage + low-file coverage CLOSED; eval breadth (ElevenLabs/AtlasCloud absent on main), skip-green keyless (#289), and no iOS export roundtrip remain.

**Diff vs last grade:** two dims rose (artifact_integrity A→A+, performance B→A); the three sub-A ship-critical dims
unchanged, so overall holds at B and the ship gate stays false. No letter regressed.

---

## 2026-07-09 — grade, commit efe1add

Re-ran the web gate this run: `npm ci && test && lint && build` → build compiled successfully, **1029 tests passed
(75 files)** (up from 956/71), coverage stmts **91.65%** / branch 82.83% / funcs 92.19% / lines 92.94% (all above the
60/60/50/60 floor), **0 lint warnings**. Latest 5 main CI runs all green on `efe1add`. Independently inspected the
**live-eval** history via the GitHub Actions API and pulled the **job logs** for the cited run. Graded with 9 fresh,
adversarial per-dimension subagents (none wrote the code), each backing its letter with a mechanical signal it ran +
file/line evidence.

**Grades:** overall **B**; `ship_gate_met = false`.

| Dimension | ship_critical | Grade | Δ vs 2026-07-05 |
|---|:---:|:---:|:---:|
| functional_reality | ✅ | B | = (within-grade ↑: #378 executing plain-path export test) |
| correctness_reliability | ✅ | A | = |
| security | ✅ | A | = |
| design_taste | ✅ | **A+** | **A → A+ ↑** |
| store_readiness | ✅ | C | = (unchanged 4 cycles) |
| artifact_integrity | ✅ | A+ | = |
| business_case_strength | ✅ | A | = |
| tests_evals | ✅ | B | = (within-grade ↑↑: 2/3 sub-gaps closed) |
| performance | ⬜ | A | = |

**What changed (real, verified):**
- **design_taste A → A+:** the sole prior residual (desktop-only journey screenshots) closed via **#397** — a real Pixel 5
  Playwright project (`playwright.config.ts:44-49`) with 7 committed mobile-viewport baselines — plus **#390** raised
  `--text-tertiary` to 0.5 (5.29:1, clears WCAG-AA). Emoji-as-UI grep = 0; iconography real; a11y strong. Zero new findings.
- **functional_reality (within B):** **#378** `ExportRoundtripTests.swift` is a genuine executing outcome-asserting test —
  synthesizes a real source video, invokes production `exportClip`, asserts a playable 1080×1920 mp4 on disk. Closes prior
  gap 1. BUT a NEW named gap surfaced under adversarial read: `ExportView.swift:275` forces `shouldWatermark=true` for every
  free user, so the *actual* shipped free-tier export always takes the watermark→`AVVideoCompositionCoreAnimationTool`
  overlay path — which the test deliberately skips (simulator hangs) and which has only config assertions. Plus gap 2
  (client-side export-count quota) persists. → stays B.
- **tests_evals (within B):** 2 of 3 sub-gaps closed — real ElevenLabs + AtlasCloud round-trip evals now exist
  (`web/src/evals/elevenlabs.eval.ts`, `atlascloud.eval.ts`), unit-tested rubric, wired into `live-eval.yml`, and proven
  GREEN with genuine paid execution in **live-eval run 28912951013** (2026-07-08); the iOS export roundtrip landed (#378).
  Remaining A-blocker: the paid-eval suite is ADVISORY — `live-eval` is not a required check and stays green when keyless
  (#289), and the `ios` check running the roundtrip is explicitly non-required (`ci.yml:125`). → stays B.
- **security (held A):** #392 (userId ≤128 + JWS/transaction length bounds before verify) and #379 (proxy-video actual-byte
  cap) confirmed. New adversarial finding recorded as a to-A+ residual: `getClientIP` takes the leftmost, spoofable XFF hop
  (`rate-limit.ts:93`), compounding the in-memory per-instance bucket — defense-in-depth only (wallet guard is KV-atomic).
- **artifact_integrity (held A+):** the one claim most exposed to inflation — #389 "ElevenLabs + AtlasCloud VALIDATED" — was
  held honest by pulling **job 85773961893** logs, which show the paid steps genuinely executed (real MP3 bytes, real Kling
  MP4 URL), not skip-guarded. All four dashboard feeds still parse under real top-level keys. #395/#393/#394 artifacts real.

**Ship gate NOT met:** needs A/A+ on every ship-critical dim; `store_readiness` C (no archivable app target + no 6.9-inch
screenshots — 4 cycles), `functional_reality` B, `tests_evals` B remain below the A bar.

**Diff vs last grade (2026-07-05, 468dd02):** design_taste **A→A+**; no regressions; three ship-critical dims below A are the
same three, but functional_reality and tests_evals each closed prior named sub-gaps (moved up within B). Overall holds **B**.

**Top gaps (ordered; filed/updated as issues #174, #176, #177):**
1. `store_readiness` C — archivable Xcode app target + 6.9-inch screenshots (the hard ship blocker).
2. `functional_reality` B — executing test for the watermark/overlay export path (the real shipped free-tier path) + server-side export-count quota.
3. `tests_evals` B — make the paid-eval suite enforceable (required / hard-fail when keyless, #289) and promote `ios` to a required check.

---

## 2026-07-11 — grade, commit 8b0b04b

Re-ran the web gate this run: `npm ci && test && lint && build` → build compiled successfully, **1070 tests passed
(76 files)** (up from 1029/75), coverage stmts **92.41%** / branch 83.73% / funcs 92.55% / lines 93.77% (all above the
60/60/50/60 floor), **0 lint warnings**. Latest 8 main CI runs all green on `8b0b04b`. Graded with 4 fresh, adversarial
per-dimension grader subagents (none wrote the code) on the inflation-exposed dimensions
(correctness/security/artifact_integrity/business_case), each backing its letter with a mechanical signal it ran +
file/line evidence; the other five settled by direct mechanical checks the auditor ran (emoji-as-UI grep, YAML feed
parse, app-target find, ios/live-eval required-check inspection, watermark/quota grep, perf-residual grep).

**Grades:** overall **B**; `ship_gate_met = false`.

| Dimension | ship_critical | Grade | Δ vs 2026-07-09 |
|---|:---:|:---:|:---:|
| functional_reality | ✅ | B | = (both iOS gaps unchanged) |
| correctness_reliability | ✅ | A | = (credit atomicity still mock-only; 133/133 pass) |
| security | ✅ | A | = (#403 closed the XFF-spoof half; in-memory buckets residual remains) |
| design_taste | ✅ | A+ | = (emoji grep 0; iconography real; tokens mirrored) |
| store_readiness | ✅ | C | = (unchanged 5 cycles; only a doc #426 moved) |
| artifact_integrity | ✅ | **A** | **A+ → A ↓** (one fresh trivial doc-vs-doc nit from #410) |
| business_case_strength | ✅ | A | = (numbers reconcile; credit lever half-shipped) |
| tests_evals | ✅ | B | = (ios + live-eval still non-required; #289 open) |
| performance | ⬜ | A | = (#419 closed residual b; no-LRU-test residual a remains) |

**What changed (real, verified):**
- **artifact_integrity A+ → A:** the sole grade change. **#410** (landed after the last grade) corrected the App Store
  screenshot headline **"7-Pass" → "6-Pass"** to match the 6-pass ProcessingView UI users see, but the historical
  narrative line `REMAINING_STEPS.md:112` still calls "the '7-pass' language is literally accurate." A genuine, if trivial
  and defensible (7 = backend stage count vs 6 = UI-displayed passes), doc-vs-doc numeric inconsistency on the exact number
  #410 corrected — a fresh finding where last cycle had none. A+ requires zero findings ⇒ A. Everything else (four feeds
  parse, uniform pricing, honest "unlimited" qualifications, no overclaim) is exemplary.
- **security (held A):** #403 CONFIRMED — rate-limit.ts:101-110 getClientIP now prefers Vercel's unspoofable x-real-ip,
  else the RIGHTMOST XFF hop; the leftmost-spoof residual is closed. ONE compounding residual remains (down from two):
  rate-limit.ts:28 in-memory per-instance buckets — defense-in-depth only (wallet guards are KV-atomic + fail-closed).
- **correctness (held A):** #435 (SFX/TTS timeout inversion fix), #436 (velocity Infinity guard), #406 (audio-mux fetch
  timeouts) all real at cause; 133/133 tests pass. Credit-grant atomicity still proven ONLY against a mock (unchanged residual).
- **performance (held A):** #419 memoized ctx.measureText in the per-frame caption loop (kinetic-text.ts:30-44) — closed
  residual (b). Residual (a) — no Swift ThumbnailService LRU-eviction ordering test (grep Tests/ = 0) — remains.
- **store_readiness (held C, 5th cycle):** only a doc moved (#426 APP_TARGET_SETUP.md). No archivable app target
  (Package.swift .library-only), no 6.9-inch screenshots, placeholder team/app IDs + empty products:[]. THE ship blocker.

**Auditor reconciliation (recorded for transparency):**
- artifact_integrity: subagent returned A (A+→A) on the REMAINING_STEPS.md:112 "7-pass" nit; I VERIFIED it independently
  (git show d3069c0 confirms the 7→6 store change; the stale line is a historical narrative, but it does touch the exact
  number #410 corrected) and ACCEPTED the downgrade rather than overriding up — holding A+ over a fresh, verified finding
  would be the inflation the rubric warns against. A still clears the A-bar, so no ship-gate impact.

**Ship gate NOT met:** needs A/A+ on every ship_critical dim; `store_readiness` C (5 cycles), `functional_reality` B,
`tests_evals` B remain below the A bar.

**Diff vs last grade (2026-07-09, efe1add):** `artifact_integrity` **A+→A** (one fresh trivial doc nit; NOT a product
regression); no other letter moved; no product regressed. The three sub-A ship-critical dims are the same three on the
same root blockers. Overall holds **B**, gate stays false.

**Top gaps (ordered; updated on issues #174, #176, #177):**
1. `store_readiness` C — archivable Xcode app target + 6.9-inch screenshots (the hard ship blocker; owner-only Mac work).
2. `functional_reality` B — executing test for the watermark/overlay export path (the real shipped free-tier path) + server-side export-count quota.
3. `tests_evals` B — make the paid-eval suite enforceable (required / hard-fail when keyless, #289) and promote `ios` to a required check.

---

## 2026-07-13 — grade, commit a4863f5

Re-ran the web gate this run: `npm ci && test && lint && build` → build ok, **1110 tests passed (79 files)** (up from
1070/76), **0 lint warnings**, coverage enforced & passing (stmts 92.71 / branch 84.04 / funcs 92.09 / lines 94.08;
60/60/50/60 hard-fail floor via vitest.config.ts + the required `web` job). Latest `ci.yml` run on HEAD `a4863f5` = success
(required checks web / web-lint / web-e2e / validate-capabilities / validate-gtm). Graded with **9 fresh, adversarial
per-dimension subagents** (none wrote the code), each backing its letter with a mechanical signal it ACTUALLY RAN + file/line
evidence (subagent test runs cited: security 90 passed / 6 files, correctness 215 passed / 14 files). 26 commits since the
last grade (`8b0b04b`) — mostly within-grade hardening (#459/#441 security, #460/#458 correctness, #445 a11y, #453/#444/#450
honesty) plus NEW Margin cost-per-outcome telemetry (#457-#467).

**Grades:** overall **B**; `ship_gate_met = false`.

| Dimension | ship_critical | Grade | Δ vs 2026-07-11 |
|---|:---:|:---:|:---:|
| functional_reality | ✅ | B | = (both iOS gaps unchanged) |
| correctness_reliability | ✅ | A | = (credit atomicity still mock-only; 215/215 pass) |
| security | ✅ | A | = (#459/#441 confirmed at cause; in-memory buckets residual remains) |
| design_taste | ✅ | A+ | = (emoji-as-UI grep 0; iconography real; tokens mirrored) |
| store_readiness | ✅ | C | = (7th cycle; only a doc #426 ever moved) |
| artifact_integrity | ✅ | **A+** | **A → A+ ↑** (#442 reconciled the 7/6-pass nit; no fresh finding) |
| business_case_strength | ✅ | A | = (numbers reconcile; credit lever half-shipped) |
| tests_evals | ✅ | B | = (ios + live-eval still non-required; margin-eval advisory; #289 open) |
| performance | ⬜ | A | = (#419 intact; new Margin telemetry no hot-path hazard; no-LRU-test residual remains) |

**What changed (real, verified):**
- **artifact_integrity A → A+:** the sole grade change and the ONLY movement this cycle. The single prior finding — the
  `REMAINING_STEPS.md` 7-pass/6-pass doc-vs-doc nit that slipped it A+→A last cycle — is **reconciled by #442**
  (REMAINING_STEPS.md:112-114 now reads "the store copy was later refined '7-Pass'→'6-Pass' in #410 to match the six
  user-visible ProcessingView passes — the backend runs seven stages"). The fresh grader found **no replacement finding**:
  5/5 dashboard YAML feeds parse (QUALITY_SCORECARD / GTM_SCORECARD / BUSINESS_CASE_SUMMARY / GROWTH_STATUS / LOOP_HEALTH),
  pricing uniform $14.99/$149.99 zero drift, honesty claims match code (480px web / 512px iOS frame downscale;
  DAILY_EXPORT_CAP=50 = "50/day fair-use"), no Margin-eval overclaim (margin-eval.yml self-labels "NOT a required check").
- **security (held A):** #459 CONFIRMED (score/route.ts:57-59 bounds frames.length>1000 BEFORE the O(n) sweep, then MAX_FRAMES=120);
  #441 CONFIRMED (growth/stats bearer compare now SHA-256 + crypto.timingSafeEqual, CWE-208 closed). In-memory per-instance
  rate-limit buckets residual remains (defense-in-depth only; wallet guards KV-atomic + fail-closed).
- **correctness (held A):** #460 redeemCreditPack fails CLOSED on a thrown ledger (real catch branch exercised, not tautology);
  #458 all four Margin emit sites awaited so they survive the Vercel serverless freeze. 215/215 tests pass. Credit-grant
  atomicity still proven ONLY against a mock (unchanged to-A+ residual).
- **tests_evals (held B):** the NEW margin-eval.yml is advisory POST-MERGE cost telemetry — self-labeled not a PR gate, skips
  green keyless, and never exits non-zero on low quality — so it does NOT close the "no real AI round-trip gates a merge"
  blocker. live-eval still non-required + keyless-green (#289); `ios` still non-required (ci.yml:125).
- **store_readiness (held C, 7th cycle):** no archivable app target (Package.swift .library-only), no 6.9-inch screenshots,
  placeholder team/app IDs + empty products:[]. THE ship blocker. Only a doc (#426) has ever moved.

**Auditor reconciliation (recorded for transparency):**
- artifact_integrity: subagent returned A+ (A→A+) on the verified #442 reconcile + a zero-findings sweep. I VERIFIED the
  reconcile independently (REMAINING_STEPS.md:112-114) and confirmed the grader's YAML/pricing/honesty checks, then ACCEPTED
  the restore. Restoring A+ on a genuinely zero-findings state is the rubric working, not inflation — last cycle's downgrade
  was on a fresh finding, and that finding is now closed with no replacement. No ship-gate impact (already ship-critical A+).

**Ship gate NOT met:** needs A/A+ on every ship_critical dim; `store_readiness` C (7 cycles), `functional_reality` B,
`tests_evals` B remain below the A bar.

**Diff vs last grade (2026-07-11, 8b0b04b):** `artifact_integrity` **A→A+** (verified nit reconcile, no replacement finding);
no other letter moved; no product regressed. The three sub-A ship-critical dims are the SAME three on the SAME root blockers.
Overall holds **B**, gate stays false.

**Top gaps (ordered; tracked on open issues #174, #176, #177):**
1. `store_readiness` C — archivable Xcode app target + 6.9-inch screenshots (the hard ship blocker; owner-only Mac work). #174 / #427.
2. `functional_reality` B — executing test for the watermark/overlay export path (the real shipped free-tier path) + server-side export-count quota. #176.
3. `tests_evals` B — make a real AI round-trip eval required / hard-fail when keyless (#289) and promote `ios` to a required check. #177.
