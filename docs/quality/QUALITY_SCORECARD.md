# HighlightMagic — Quality Scorecard

Independent grade (maker ≠ checker). Graded against `docs/quality/QUALITY_RUBRIC.md`, backed by real
mechanical signals. The factory loop CONSUMES this as DATA — it never authors or self-grades it.

```yaml
# QUALITY_SCORECARD (machine-readable; the factory dashboard reads this block)
QUALITY_SCORECARD:
  as_of: 2026-07-13
  auditor: independent-quality-auditor
  commit: a4863f5
  overall: B            # unchanged: one dimension IMPROVED this cycle (artifact_integrity A→A+, the #442 doc reconcile) but the three ship-critical sub-A dims are the SAME three on the SAME root blockers — still NOT ship-ready
  ship_gate_met: false  # ship gate needs A/A+ on EVERY ship_critical dim; store_readiness=C (7th cycle), functional_reality=B, tests_evals=B remain below the A bar
  mechanical_signals:
    main_ci: green            # latest ci.yml run on HEAD a4863f5 = success (required checks: web, web-lint, web-e2e, validate-capabilities, validate-gtm); latest 8 main CI runs all success
    web_gate_this_run: green  # `npm ci && test && lint && build` re-run this run: 1110 tests passed, coverage enforced & passing, 0 lint warnings, build compiled successfully
    web_unit_tests: "1110 passed (79 files)"   # up from 1070/76 last grade
    coverage_enforced: true   # @vitest/coverage-v8 installed; `test` = `vitest run --coverage`; required CI `web` job runs it; vitest.config.ts thresholds 60/60/50/60 hard-fail below floor
    coverage_this_run: "stmts 92.71% / branch 84.04% / funcs 92.09% / lines 94.08% — all above the 60/60/50/60 floor"
    subagent_test_runs: "security 90 passed (6 files: rate-limit/spend-ceiling/entitlement); correctness 215 passed (14 files: credit-store/poll-manager/atlascloud/velocity/entitlement/elevenlabs)"
    ios_build: green          # via `ios` CI check (Linux auditor cannot xcodebuild); NOTE ios is a NON-required check (ci.yml:125 kept non-required until reliably green) — advisory only
    live_eval_latest: "live-eval is NOT a required check and skips-green when keyless (#289 unresolved); NEW margin-eval.yml is advisory post-merge cost telemetry (self-labeled NOT a PR gate, never fails on quality regression)"
  dimensions:
    - name: functional_reality
      ship_critical: true
      grade: B
      evidence: >-
        UNCHANGED — both named gaps persist (fresh adversarial grader re-verified). (1) The actual free-tier shipped export
        ALWAYS takes the overlay path: ExportView.swift:275 still forces `shouldWatermark = appState.isProUser ? addWatermark
        : true`, and ClipGenerationService.swift:1072 (`|| addWatermark`) drives hasOverlay→:1075 attaches
        AVVideoCompositionCoreAnimationTool; the ONLY executing test (ExportRoundtripTests.swift:115-125) deliberately drives
        addWatermark:false / filter:.none / captionText:"" (the no-overlay branch), and its own comments (:107-114 +
        ClipGenerationService.swift:1063-1067) concede the overlay pass hangs on the CI simulator, while ExportServiceTests.swift
        is config-only (never invokes exportClip) — so the shipped free-user path has ZERO executing coverage. (2) Export-COUNT
        quota is purely client-side UserDefaults: AppState.swift:26-27/:109 canExportFree/:125-128 increment, wiped by
        SettingsView.swift:200 removeObject; no server checkExportAllowed/consumeExport on the export-count path (grep Sources/
        = 0; web/ has only AI-generation entitlement gating). Web e2e (`playwright test --list` = 14 tests = 7 specs × 2 viewports)
        asserts real intended outcomes but is all navigation/waitlist — none drives import→detect→edit→export or asserts a
        produced mp4. The plain encode→1080×1920 mp4 pipeline IS proven (ExportRoundtripTests :130-157 real playable-file asserts).
      gap_to_a: >-
        Add an executing export test that drives the OVERLAY pass (addWatermark:true and/or non-empty captionText through
        AVVideoCompositionCoreAnimationTool → a real 1080×1920 mp4) on a device/macOS lane that doesn't hang, so the ACTUAL
        free-tier shipped path is proven end-to-end (not just config-asserted); and gate the export COUNT server-side
        (checkExportAllowed/consumeExport on the export path) so the free limit survives reinstall. (Tracked: issue #176.)
    - name: correctness_reliability
      ship_critical: true
      grade: A
      evidence: >-
        Held A (fresh adversarial grader ran `npx vitest run credit-store poll-manager atlascloud velocity entitlement
        elevenlabs` → 14 files, 215 passed). Recent fixes verified genuine at cause: #460 redeemCreditPack fails CLOSED on a
        thrown ledger (entitlement.ts:328-334 catch → {ok:false,granted:0,balance:0}; the outage test drives mockRejectedValueOnce
        and a resolved-grant control, so the real catch branch is exercised, not a tautology); #458 all four Margin emit sites
        (detect.ts:1072/2823, validate/route.ts:296/352) use `await getMeter()?.recordCall(...)?.catch(()=>{})` so they survive
        the Vercel serverless freeze (margin-meter-client.ts:22-28 documents why the await is mandatory) — no fire-and-forget
        hazard. poll-manager.ts delete-before-settle holds at every exit (:59-61/:92-93/:96/:108-109/:162-163) — no
        duplicate-callback race. entitlement.ts fails CLOSED on KV read errors (:160-168); post-export consume fails OPEN
        best-effort (:244/:258) — correct asymmetry (COGS already spent).
      gap_to_a: >-
        (To A+) UNCHANGED residual: the revenue-critical credit-grant atomicity (single Lua SET-NX+INCRBY,
        credit-store.ts:113-121) is proven ONLY against a mock — credit-store.test.ts:119-122 explicitly concedes it "does NOT
        exercise a real timeout" and split-write safety "can only be proven against real KV"; the live-KV round-trip stays queued
        in REMAINING_STEPS.md Phase 0b (owner-blocked on KV provisioning). Land the live-KV integration test in CI.
    - name: security
      ship_critical: true
      grade: A
      evidence: >-
        Held A (fresh adversarial grader; `npx vitest run rate-limit spend-ceiling entitlement` → 6 files, 90 passed). #459
        CONFIRMED: score/route.ts:57-59 rejects frames.length>1000 BEFORE the O(n) shape sweep (:60) and per-frame size scan
        (:65), then caps to MAX_FRAMES=120 (:92). #441 CONFIRMED: growth/stats/route.ts:13-17 bearerTokenMatches SHA-256-hashes
        both sides and compares via crypto.timingSafeEqual (CWE-208 closed; used :45). Paid-call chain correctly ordered on
        score/route.ts: rate-limit(:42) → input bounds(:57-66) → entitlement checkExportAllowed(:69) → daily ceiling(:78) →
        server-held ANTHROPIC_API_KEY via x-api-key(:86,117), never client; validate/route.ts mirrors it (:29/:51-88/:92/:102/:32).
        Entitlement server-authoritative (entitlement.ts:92-117 Apple-root ES256 JWS verify, empty root→deny) and fails CLOSED on
        KV error; spend-ceiling.ts KV-atomic INCR + fail-closed. No committed secrets (every grep hit is a placeholder /
        test-fixture PEM / doc example). Headers strong: middleware.ts:45-69 nonce+strict-dynamic CSP, no unsafe-inline,
        object-src/frame-ancestors 'none'; next.config.ts HSTS preload + DENY + locked CORS.
      gap_to_a: >-
        (To A+) ONE compounding residual remains: rate-limit.ts:28 `const buckets = new Map()` is still in-memory per-serverless-
        instance, so an attacker fanned across N instances gets ~N× the per-IP throttle. Defense-in-depth only — the
        authoritative wallet guards (server-verified entitlement + KV-atomic fail-closed spend ceiling) are both cross-instance,
        so the drain is hard-bounded regardless. Back buckets with the KV atomic-INCR+TTL pattern already in spend-ceiling.ts.
    - name: design_taste
      ship_critical: true
      grade: A+
      evidence: >-
        Held A+ with zero findings. Adversarial emoji-as-UI grep `rg "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2190}-\x{21FF}
        \x{2B00}-\x{2BFF}]" web/src Sources/Views` → every hit is →/✓/✗ inside code comments, tests, eval logs, or .md docs; a
        `.tsx Sources/Views` rendered-UI scan returned ZERO — no emoji reaches a label or button. Real iconography: lucide-react
        in 10 web files, SF Symbols Image(systemName:) in 14 Sources/Views files. Bespoke tokens mirrored web↔iOS: globals.css:9,11
        --accent #7C3AED / --accent-pink #EC4899 == Theme.swift:31,32. #445 confirmed: decorative icons carry aria-hidden across
        landing/page.tsx + Confetti.tsx:32. a11y strong: focus-visible rings (globals.css:114-122), 48/44px touch targets
        (:210,214), aria-label on interactive controls across 9 components.
      gap_to_a: none — A+ held (emoji-as-UI grep = 0; real iconography; bespoke tokens mirrored; a11y intact; no new finding). Hold by re-running the emoji-as-UI grep + a11y token check each grade.
    - name: store_readiness
      ship_critical: true
      grade: C
      evidence: >-
        UNCHANGED for a SEVENTH cycle — the single dimension keeping ship_gate_met=false; only a DOC has ever moved this window
        (#426 docs/ios/APP_TARGET_SETUP.md, a ~20-min Mac-job writeup — NOT an actual target). (1) NO archivable Xcode app target:
        `find` for *.xcodeproj/*.xcworkspace/project.yml/Project.swift/*.xcconfig/project.pbxproj returns ZERO; Package.swift:9-14
        declares only a .library product (a SwiftPM library cannot emit a signed submittable IPA); ci.yml:151 does `xcodebuild ...
        clean build test` only — no archive/-exportArchive/signing, and the ios job is NON-required (ci.yml:125). (2) Required
        6.9-inch (1320×2868) screenshots + preview ABSENT — brand-kit.md:143 + aso-package.md:109 still "Needed"; every committed
        PNG is a web/Playwright artifact or an icon. (3) StoreKitConfiguration.storekit:4 products:[] empty (consumable credit-pack
        SKU absent) and :6-8 still hold placeholder _applicationInternalID "1234567890" / _developerTeamID "XXXXXXXXXX". Passing
        items ARE accurate: privacy manifest (4 declared data types + CA92.1/C617.1 API reasons), NS*UsageDescription strings,
        ITSAppUsesNonExemptEncryption=false, pricing consistent $14.99/$149.99.
      gap_to_a: >-
        Add a real archivable iOS APP target (XcodeGen project.yml / Tuist / .xcodeproj wrapping the SwiftPM library, with
        code-signing) and wire `xcodebuild archive -exportArchive` into CI to produce a signed IPA; capture + commit the real
        6.9-inch (1320×2868) App Store screenshot set + preview, flipping brand-kit.md:143 from "Needed" to shipped; replace the
        placeholder team/app IDs; and add the consumable credit-pack SKU to StoreKitConfiguration.storekit. (Owner-only Mac work
        per docs/ios/APP_TARGET_SETUP.md; tracked: issues #174 + #427.)
    - name: artifact_integrity
      ship_critical: true
      grade: A+
      evidence: >-
        A → A+ this cycle: the sole prior finding (the REMAINING_STEPS.md 7-pass/6-pass doc-vs-doc nit) is RECONCILED by #442 and
        no fresh finding replaces it (fresh adversarial grader). REMAINING_STEPS.md:112-114 now reads explicitly "the store copy
        was later refined '7-Pass'→'6-Pass' in #410 to match the six user-visible ProcessingView passes — the backend runs seven
        stages" (7 = backend stage count, 6 = UI-displayed passes; QUALITY_SCORECARD.md:121-122 states the same, "no overclaim").
        All 5 dashboard-feed YAML blocks parse under real single top-level keys (python3 yaml.safe_load: QUALITY_SCORECARD,
        GTM_SCORECARD, BUSINESS_CASE→BUSINESS_CASE_SUMMARY, GROWTH_STATUS, LOOP_HEALTH). Pricing uniform $14.99/$149.99 across
        .storekit:25,47 / SubscriptionProduct.swift / AppStoreMetadata.swift / landing / faq / layout / ExportStep / BUSINESS_CASE
        — zero drift. Honesty claims match code: frame downscale disclosed "480px web / 512px iOS" matches frame-extractor.ts:20
        (480) + CloudScoringService.swift:63 (512) (#453/#444); DAILY_EXPORT_CAP=50 (spend-ceiling.ts:40) matches the "50/day
        fair-use" disclosures (#450). No Margin-eval overclaim — margin-eval.yml:10 self-labels "NOT a required check".
      gap_to_a: none — A+ restored (nit reconciled, 5/5 feeds parse, zero pricing drift, honesty claims match code, no Margin overclaim). Two bare non-export "unlimited" copy instances (PaywallView.swift:63, ExportStep.tsx:1076) are pre-existing, cross-tracked in GTM_SCORECARD:117,140, and out of this dimension's export-quota scope — not a fresh finding.
    - name: business_case_strength
      ship_critical: true
      grade: A
      evidence: >-
        Held A — every load-bearing number independently recomputed (python3) and reconciles, no gaming: M12 MRR
        43×$14.99=$644.57≈$645 (BUSINESS_CASE §4:262); ARR floor 556×$14.99×12=$100,013 and exact break-even 555.93 subs (:275
        "~556" exact); live unit econ $10.49−$4.65 COGS=+$5.84/user/mo, 55.7% GM gross-margin-POSITIVE (§3:199); base arr_year1
        43×$14.99×12=$7,734.84≈7740; conversion 3% inside the cited 2-5% Userpilot benchmark. Honesty PASS: floor_met_year1=false
        stated (summary:13); §10:464-472 books $0 ARR for the not-yet-purchasable credit lever and refuses to invent an attach
        rate; the §9 30%-annual-uptake is explicitly illustrative and was DE-inflated in Run 65 (#455/#462). Margin telemetry
        (#457-#467) is infra — §3 still labels per-export COGS "Estimates only" (~$0.31 modeled), not yet fed real per-outcome
        numbers (honest).
      gap_to_a: >-
        (To A+) UNCHANGED: the flagship credit-pack lever is still only HALF shipped — `grep -rin "credit|consumable" Sources/`
        = 0 and StoreKitConfiguration.storekit products:[] is empty, so credits are NOT user-purchasable in-app and revenue can't
        flow. Ship the consumable SKUs in .storekit AND build the iOS StoreKit consumable purchase→/api/credits/redeem UI, then
        recompute base/optimistic ARR with a defensible benchmarked attach rate. (Depends on the store_readiness .storekit fix.)
    - name: tests_evals
      ship_critical: true
      grade: B
      evidence: >-
        UNCHANGED B. The suite grew to 1110 tests / 79 files (from 1070/76), coverage enforced and passing (stmts 92.71 / branch
        84.04 / funcs 92.09 / lines 94.08; vitest.config.ts:11-16 thresholds 60/60/50/60 hard-fail, run by the REQUIRED `web` job
        ci.yml:24-25). Assertions are real, not tautological (detect.eval.ts:110-156 asserts clip-count/duration/theme bounds vs
        fixture _expected; grader.test.ts:44-53 verifies the grader is strictly non-increasing / never always-pass). But the
        A-blocker is UNCHANGED: no real paid AI round-trip gates a merge. live-eval.yml is NOT a required check (workflow_dispatch
        + weekly cron, :11-17) and stays GREEN keyless (::warning::+pass when ANTHROPIC_API_KEY absent, :51-55; provider steps
        `if: env.X != ''`) — #289 open. The NEW margin-eval.yml is ADVISORY post-merge cost telemetry (self-labeled ":10 NOT a
        required check ... :16 can't block anything", skips-green keyless, and margin-eval.eval.ts:416-419/444 NEVER exits non-zero
        on low quality). The `ios` check running ExportRoundtripTests is explicitly NON-required (ci.yml:124-125).
      gap_to_a: >-
        Make at least one real AI round-trip eval a required, merge-blocking check that hard-fails (non-zero exit) on quality
        regression and cannot pass keyless (#289 — margin-eval and live-eval both remain advisory/post-merge, so no live-quality
        signal gates a merge); and promote `ios` to a required check so the executing iOS export roundtrip actually gates merges.
        (Tracked: issue #177.)
    - name: performance
      ship_critical: false
      grade: A
      evidence: >-
        Held A. #419 memoization intact: kinetic-text.ts:30-42 measureTextCached keyed by (font+text), bounded by
        MEASURE_CACHE_MAX=2048 (:27,:39), consumed in the per-frame caption render loops (wrapText :333, drawSpacedText :502), now
        with a 2100-iteration cap/eviction test (kinetic-text.test.ts:277-324). The new Margin work (#457-#467) adds NO hot-path
        hazard — margin-meter-client.ts:70-90 is a cached guarded singleton; emits are a single await per operation, no per-frame
        loop, no unbounded accumulation. #459 bound confirmed (score/route.ts:57 rejects >1000 before the O(n) sweep, then slices
        to MAX_FRAMES=120). iOS ThumbnailService per-entry LRU intact; web asset-cache per-entry 24h TTL + LRU MAX_ENTRIES 50.
        Web build compiled successfully this run.
      gap_to_a: >-
        (To A+) ONE bounded residual remains (open several cycles): NO Swift test asserting ThumbnailService eviction ORDER
        (`grep -rlin 'thumbnail|accessOrder|evict|maxCacheSize' Tests/` = 0). Add an LRU-eviction ordering test so the
        coldest-key-evicted invariant is locked against regression. (Test-coverage gap, not a perf regression.)
  top_gaps:
    - "store_readiness (C, ship-critical): NO archivable Xcode app target (Package.swift is .library-only — a SwiftPM package cannot produce a submittable IPA; CI has no -exportArchive) and missing 6.9-inch (1320×2868) App Store screenshots/preview — the single dimension keeping ship_gate_met=false. Also placeholder team/app IDs and the consumable credit-pack SKU absent from StoreKitConfiguration.storekit. UNCHANGED for SEVEN cycles; only a doc (#426) has ever moved. Owner-only Mac work. Tracked: #174, #427."
    - "functional_reality (B, ship-critical): the ACTUAL free-tier shipped export ALWAYS takes the watermark→AVVideoCompositionCoreAnimationTool overlay path (ExportView.swift:275 forces shouldWatermark=true for free users), which has ZERO executing coverage (only config assertions) and hangs on the CI simulator; and the export-COUNT quota is still client-side UserDefaults (AppState.swift:26-27 / SettingsView.swift:200 removeObject, reset by reinstall). Both gaps unchanged. Tracked: #176."
    - "tests_evals (B, ship-critical): eval breadth + the iOS export roundtrip exist and ran green — but NO real paid AI round-trip gates a merge: live-eval.yml is not a required check and stays green keyless (#289), the NEW margin-eval.yml is advisory post-merge cost telemetry that never fails on quality regression, and the `ios` check running ExportRoundtripTests is explicitly NON-required (ci.yml:125). Tracked: #177."
```

## How to read this

`overall: B` — a product that keeps **hardening within grade** (the web suite grew to **1110 tests** with coverage at
**92.71% stmts**; security closed #459/#441; correctness verified #460/#458 at cause; performance absorbed the new Margin
telemetry with no hot-path hazard) and that **improved one dimension this cycle**, but is **still not ship-ready**. The ship
gate stays **false** because three ship-critical dimensions remain below the A bar — the same three, on the same root blockers.

**What moved this cycle.** `artifact_integrity` **A → A+**: the single prior finding — the `REMAINING_STEPS.md` 7-pass/6-pass
doc-vs-doc nit — is **reconciled by #442** (the line now reads "the store copy was later refined '7-Pass'→'6-Pass' in #410 to
match the six user-visible ProcessingView passes — the backend runs seven stages"), and the fresh adversarial grader found **no
replacement finding** (5/5 dashboard YAML feeds parse, zero pricing drift, honesty claims match code, no Margin-eval overclaim).
Restoring A+ on a verified zero-findings state is an accepted improvement, not inflation. Everything else held: `security` **A**
(one in-memory-bucket residual), `correctness_reliability` **A** (credit atomicity still mock-only; 215/215 tests pass),
`business_case_strength` **A** (all numbers independently recomputed, reconcile; credit lever still half-shipped), `design_taste`
**A+** (emoji-as-UI grep = 0), and `performance` **A** held with no regression.

**Why the gate stays false.** `store_readiness` is still **C** — no archivable Xcode app target (a SwiftPM `.library` cannot be
submitted) and no 6.9-inch App Store screenshots; **open for seven cycles** and only a doc (#426) has ever moved. `functional_reality`
is **B** — the *actual* free-tier shipped export always takes the watermark→Core-Animation overlay path, which has no executing
coverage and hangs on the CI simulator, and the export-count quota is still client-side/resettable. `tests_evals` is **B** — the
evals exist and are non-tautological, but **no real paid AI round-trip gates a merge**: `live-eval` is not required and stays green
keyless (#289), the new `margin-eval` is advisory post-merge cost telemetry that never fails on quality regression, and the `ios`
check running the roundtrip is explicitly non-required. The factory should drive the ordered `top_gaps`, starting with the
`store_readiness` C.

Grades are backed by the mechanical signals above (web gate re-run green this run: 1110 tests, coverage enforced, 0 lint, build ok;
main CI green on `a4863f5`; per-dimension subagent test runs cited) and per-dimension file/line evidence — graded by nine fresh,
independent, adversarial per-dimension subagents (none wrote the code), reconciled with independent auditor judgment. The one grade
change (`artifact_integrity` A→A+) was accepted on a verified reconcile + zero-findings state, not rubber-stamped up. No grade
exceeds its evidence.
