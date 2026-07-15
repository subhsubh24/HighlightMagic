# HighlightMagic — Quality Scorecard

Independent grade (maker ≠ checker). Graded against `docs/quality/QUALITY_RUBRIC.md`, backed by real
mechanical signals. The factory loop CONSUMES this as DATA — it never authors or self-grades it.

```yaml
# QUALITY_SCORECARD (machine-readable; the factory dashboard reads this block)
QUALITY_SCORECARD:
  as_of: 2026-07-15
  auditor: independent-quality-auditor
  commit: a754876
  overall: B            # unchanged: no product dimension advanced or regressed; the single grade move is artifact_integrity A+→A on a lagging SIBLING dashboard feed (GTM_SCORECARD, not product), and the three ship-critical sub-A dims are the SAME three on the SAME root blockers — still NOT ship-ready
  ship_gate_met: false  # ship gate needs A/A+ on EVERY ship_critical dim; store_readiness=C (8th cycle), functional_reality=B, tests_evals=B remain below the A bar
  mechanical_signals:
    main_ci: green            # latest ci.yml run on HEAD a754876 = success (required checks: web, web-lint, web-e2e, validate-capabilities, validate-gtm); latest 15 main CI runs all success
    web_gate_this_run: green  # `npm ci && test && lint && build` re-run this run: 1124 tests passed, coverage enforced & passing, 0 lint warnings, build compiled successfully
    web_unit_tests: "1124 passed (80 files)"   # up from 1110/79 last grade
    coverage_enforced: true   # @vitest/coverage-v8 installed; `test` = `vitest run --coverage`; required CI `web` job runs it; vitest.config.ts thresholds 60/60/50/60 hard-fail below floor
    coverage_this_run: "stmts 93.15% / branch 84.62% / funcs 92.65% / lines 94.57% — all above the 60/60/50/60 floor"
    subagent_test_runs: "security 134 passed (10 files: rate-limit/spend-ceiling/entitlement/ios-score/validate); correctness 185 passed (11 files: credit-store/poll-manager/atlascloud/entitlement/velocity/ios-score/validate)"
    ios_build: green          # via `ios` CI check (Linux auditor cannot xcodebuild); NOTE ios is a NON-required check (ci.yml:125 kept non-required until reliably green) — advisory only
    live_eval_latest: "live-eval is NOT a required check and skips-green when keyless (#289 unresolved); margin-eval.yml is advisory post-merge cost telemetry (self-labeled NOT a PR gate, never fails on quality regression)"
  dimensions:
    - name: functional_reality
      ship_critical: true
      grade: B
      evidence: >-
        UNCHANGED — both named gaps persist after 31 commits (fresh adversarial grader re-verified). (1) The actual free-tier
        shipped export ALWAYS takes the overlay path: ExportView.swift:275 still forces `shouldWatermark = appState.isProUser ?
        addWatermark : true`, driving hasOverlay → AVVideoCompositionCoreAnimationTool; the ONLY executing export test
        (ExportRoundtripTests.swift:115-125) deliberately drives addWatermark:false / filter:.none / captionText:"" (the
        no-overlay branch) and its own comments (:107-114) concede the overlay pass HANGS on the CI simulator, while
        ExportServiceTests.swift is config-only (never invokes exportClip) — so the shipped free-user overlay path has ZERO
        executing coverage. (2) Export-COUNT quota is purely client-side UserDefaults: AppState.swift:26-33 persists
        exportsUsedThisMonth, :108-128 canExportFree/increment, wiped by SettingsView.swift:200-201 removeObject and by reinstall;
        no server checkExportAllowed/consumeExport on the export-COUNT path (the web checkExportAllowed/consumeExport calls gate
        AI-generation routes, not the local AVFoundation export count). Web e2e (`playwright test --list` = 14 tests) asserts real
        intended outcomes but is all render/waitlist/nav — none drives import→detect→edit→export or asserts a produced mp4. The
        plain encode→1080×1920 mp4 pipeline IS proven (ExportRoundtripTests:130-157 real playable-file asserts on disk).
      gap_to_a: >-
        Add an executing export test that drives the OVERLAY pass (addWatermark:true and/or non-empty captionText through
        AVVideoCompositionCoreAnimationTool → a real 1080×1920 mp4) on a device/macOS lane that doesn't hang, so the ACTUAL
        free-tier shipped path is proven end-to-end (not just config-asserted); and gate the export COUNT server-side
        (checkExportAllowed/consumeExport on the export path) so the free limit survives reinstall. (Tracked: issue #176.)
    - name: correctness_reliability
      ship_critical: true
      grade: A
      evidence: >-
        Held A (fresh adversarial grader ran `npx vitest run credit-store poll-manager atlascloud entitlement velocity ios-score
        validate` → 11 files, 185 passed). #469 (drop the erroneous ios-validate monthly-quota re-gate) verified CORRECT at cause:
        the dropped gate was a READ-ONLY checkExportAllowed; ios-validate never called consumeExport (the sole decrement is
        ios-score/route.ts:409), so removal cannot double-count or bypass — the wallet backstop (enforceGenerationCeiling
        ios-validate/route.ts:251, KV-atomic fail-closed; PAID_RATE_LIMIT; payload bounds) is preserved, and the prior behavior
        wrongly 402'd the last free export's QA sub-step. #496 templateName bound clean (ios-score:340 overStringLimit fires 413
        BEFORE entitlement:354 / consume:409 / paid call). poll-manager delete-before-settle holds at every exit; entitlement
        fails CLOSED on KV read errors, post-export consume fails OPEN best-effort (correct asymmetry — COGS already spent).
      gap_to_a: >-
        (To A+) UNCHANGED residual: the revenue-critical credit-grant atomicity (single Lua SET-NX+INCRBY,
        credit-store.ts:113-121) is proven ONLY against a mock — credit-store.test.ts:119-122 explicitly concedes it "does NOT
        exercise a real timeout" and split-write safety "can only be proven against real KV"; the live-KV round-trip stays queued
        in REMAINING_STEPS.md Phase 0b (owner-blocked on KV provisioning). Land the live-KV integration test in CI.
    - name: security
      ship_critical: true
      grade: A
      evidence: >-
        Held A (fresh adversarial grader; `npx vitest run rate-limit spend-ceiling entitlement ios-score validate` → 10 files,
        134 passed). #496 CONFIRMED: ios-score/route.ts:340 overStringLimit(templateName, MAX_TEMPLATE_NAME_CHARS=200) → 413 fires
        BEFORE entitlement checkExportAllowed(:354), spend ceiling(:365) and the paid Anthropic call(:386) — templateName is
        interpolated into the scorer's own system prompt(:38), so the length cap closes the token-inflation/DoS surface
        (length-bounded, not charset — acceptable for this vector). #475 CONFIRMED: validate/route.ts:115
        enforceGlobalGenerationCeiling("validate", GLOBAL_VALIDATE_DAILY_CAP) runs unconditionally before the paid Haiku fetch(:270);
        spend-ceiling.ts:275-290 does an atomic kv.incr on a DEDICATED "global-gen" keyspace (structurally unreachable from the
        client-supplied per-user "gen" keyspace, so a forged userId can't zero it), shared single counter = rotation-proof across
        IPs/instances, fail-closed on KV error — NOT in-memory. Paid-call chain correctly ordered; entitlement server-authoritative
        (Apple-root ES256 JWS verify, fails CLOSED); spend-ceiling KV-atomic + fail-closed. No committed secrets (every grep hit is a
        placeholder/test-fixture PEM). Headers strong: middleware.ts nonce+strict-dynamic CSP, HSTS preload + DENY + locked CORS.
      gap_to_a: >-
        (To A+) ONE compounding residual remains (unchanged): rate-limit.ts:28 `const buckets = new Map()` is still in-memory
        per-serverless-instance, so an attacker fanned across N instances gets ~N× the per-IP throttle. Defense-in-depth only — the
        authoritative wallet guards (server-verified entitlement + KV-atomic fail-closed spend ceilings + the new global validate
        ceiling) are all cross-instance, so paid-spend blast radius is hard-bounded regardless. Back buckets with the KV atomic-INCR+TTL
        pattern already in spend-ceiling.ts.
    - name: design_taste
      ship_critical: true
      grade: A+
      evidence: >-
        Held A+ with zero findings. Adversarial emoji-as-UI grep over RENDERED UI (web/src/app, web/src/components, Sources/Views) →
        every emoji-range hit is a →/✓/✗ inside code comments, route handlers, or tests; ZERO reach a label/button/JSX string
        (Sources/Views = 0 matches). New surfaces clean: the branded 404 (not-found.tsx, #477) uses design tokens + semantic h1 +
        real <Link>, on-brand copy ("This page took a different cut"), no emoji/slop; #498 CTA reroute ADDED a11y (aria-busy on the
        waitlist submit, tap-target parity). Real iconography: lucide-react in 10 web files, SF Symbols Image(systemName:) in 14
        Sources/Views files. Bespoke tokens mirrored web↔iOS: globals.css:9,11 --accent #7C3AED / --accent-pink #EC4899 ==
        Theme.swift:31-32. Slop scan on landing/page.tsx = 0 hits (unleash/supercharge/seamlessly/…). a11y strong: focus-visible
        rings (globals.css:117,123), 48/44px touch targets, aria-labels across 9 components.
      gap_to_a: none — A+ held (emoji-as-UI grep = 0; real iconography; bespoke tokens mirrored; a11y intact; new 404/CTA surfaces clean; no new finding). Hold by re-running the emoji-as-UI grep + a11y token check + slop scan each grade.
    - name: store_readiness
      ship_critical: true
      grade: C
      evidence: >-
        UNCHANGED for an EIGHTH cycle — the single dimension keeping ship_gate_met=false; only DOCS/COPY moved this window. (1) NO
        archivable Xcode app target: `find` for *.xcodeproj/*.xcworkspace/project.yml/Project.swift/*.pbxproj returns ZERO;
        Package.swift:9-12 declares only a .library product (a SwiftPM library cannot emit a signed submittable IPA); ci.yml:150 does
        `xcodebuild ... clean build test` only — no archive/-exportArchive/signing, and the ios job is NON-required (ci.yml:125). (2)
        Required 6.9-inch (1320×2868) screenshots + preview ABSENT — brand-kit.md:142-143 + aso-package.md:109 still "⬜ Needed"; every
        committed PNG is a web/Playwright artifact or an icon. (3) StoreKitConfiguration.storekit:4 products:[] empty (consumable
        credit-pack SKU absent) and :6-7 still hold placeholder _applicationInternalID "1234567890" / _developerTeamID "XXXXXXXXXX".
        The honesty-copy fixes that DID land (#498 route store CTAs to waitlist while pre-launch; #470/#476/#478/#479 drop false
        "multi-pass"/"unlimited" claims) are real and legitimate but are copy/doc-only — they touch NONE of the three structural
        blockers. Passing items ARE accurate: privacy manifest (4 declared data types + CA92.1/C617.1 API reasons), NS*UsageDescription
        strings, ITSAppUsesNonExemptEncryption=false, subscription pricing consistent $14.99/$149.99.
      gap_to_a: >-
        Add a real archivable iOS APP target (XcodeGen project.yml / Tuist / .xcodeproj wrapping the SwiftPM library, with
        code-signing) and wire `xcodebuild archive -exportArchive` into CI to produce a signed IPA, then promote `ios` to required;
        capture + commit the real 6.9-inch (1320×2868) App Store screenshot set + preview, flipping brand-kit.md:143 from "Needed" to
        shipped; replace the placeholder team/app IDs; and add the consumable credit-pack SKU to StoreKitConfiguration.storekit.
        (Owner-only Mac work per docs/ios/APP_TARGET_SETUP.md; tracked: issues #174 + #427.)
    - name: artifact_integrity
      ship_critical: true
      grade: A
      evidence: >-
        A+ → A this cycle on ONE fresh, verified dashboard-feed-vs-reality mismatch (fresh adversarial grader; independently
        confirmed by the auditor). docs/growth/GTM_SCORECARD.md:19 still asserts `ship_gate_met: false` with the rationale "a false
        '7 kinetic caption styles' claim in a ready-to-record content asset" and its evidence prose calls the defect "persists/unfixed"
        — but #493 (3bfd330, 2026-07-14 10:58) FIXED exactly that (docs/content/post-batch-1.md now reads "4 animated caption styles";
        grep for any residual "7 kinetic/caption" overclaim in content/ASO = 0), landing ~3h AFTER the GTM re-grade #491 (1abada2,
        07:49), and `git log 3bfd330..HEAD -- docs/growth/GTM_SCORECARD.md` is empty (not re-graded since). So a dashboard feed no
        longer matches reality → not a zero-findings state → A. MITIGATION (why still A, not lower): it is CONSERVATIVE staleness in a
        SIBLING-owned feed (the independent GTM auditor's lagging snapshot, pending its own re-grade) — the product does NOT overclaim;
        if anything the GTM feed under-claims (says ship-gate-false over a fixed defect). No PRODUCT integrity defect found. Everything
        else exemplary: all 5 dashboard YAML feeds parse under real top-level keys (python3 yaml.safe_load: QUALITY_SCORECARD,
        GTM_SCORECARD, BUSINESS_CASE_SUMMARY, GROWTH_STATUS, LOOP_HEALTH); pricing uniform $14.99/$149.99 zero drift across
        .storekit/Swift/web/docs; kinetic-caption honesty now accurate (KineticCaptionRenderer.swift:34-36 — only 4 of 7 styles animate,
        content matches); 8 sampled ticked claims map to real wired artifacts.
      gap_to_a: >-
        Restore A+ by reconciling the sibling GTM_SCORECARD dashboard feed with reality: the GTM auditor's next re-grade should
        reflect #493 (the "7 kinetic caption" defect is fixed), lifting GTM_SCORECARD's artifact_freshness / ship_gate_met so no
        dashboard feed asserts a non-existent defect. NOTE: this remediation belongs to the independent GTM-audit routine's re-grade,
        NOT to factory product work — it is self-healing on the next GTM audit cycle. No PRODUCT change is required.
    - name: business_case_strength
      ship_critical: true
      grade: A
      evidence: >-
        Held A — every load-bearing number independently recomputed (python3) and reconciles, no gaming: net rev/user $10.49; COGS
        15×$0.31=$4.65; GM +$5.84/user/mo = 55.7% gross-margin-POSITIVE; M12 subs 42.9 → MRR ≈$645; ARR floor 555.9 subs ×$14.99×12
        =$100,013; YAML arr_year1 {cons 3060, base 7740, opt 33460} reproduce within <1% (sub-integer rounding, not gaming);
        conversion 3% inside the cited 2-5% benchmark. #494 §9 reconciliation VERIFIED internally consistent: BUSINESS_CASE.md:427-433
        now states the ~M42→M38 crossing is "driven entirely by the $9.99→$14.99 price move ... not re-counted here," matching the
        summary's annual_tier_lever ("NO ARR-timeline acceleration booked to the annual tier") — the double-attribution the changelog
        claims to fix is genuinely absent. Honesty PASS: floor_met_year1=false stated (BUSINESS_CASE.md:13); §10 books $0 ARR for the
        not-yet-purchasable credit lever and refuses to invent an attach rate; §9 30%-uptake explicitly illustrative optionality.
      gap_to_a: >-
        (To A+) UNCHANGED: the flagship credit-pack lever is still only HALF shipped — backend complete (credit-store.ts / entitlement.ts
        redeemCreditPack / constants.ts CREDIT_PACK_PRODUCTS, tested) but `grep -rin "credit|consumable" Sources/` = 0 and
        StoreKitConfiguration.storekit products:[] is empty, so credits are NOT user-purchasable in-app and revenue can't flow. Ship the
        consumable SKUs in .storekit AND build the iOS StoreKit consumable purchase→/api/credits/redeem UI, then recompute base/optimistic
        ARR with a defensible benchmarked attach rate. (Depends on the store_readiness .storekit fix.)
    - name: tests_evals
      ship_critical: true
      grade: B
      evidence: >-
        UNCHANGED B. The suite grew to 1124 tests / 80 files (from 1110/79), coverage enforced and passing (stmts 93.15 / branch 84.62 /
        funcs 92.65 / lines 94.57; vitest.config.ts thresholds 60/60/50/60 hard-fail, run by the REQUIRED `web` job). Assertions are real,
        not tautological (detect.eval.ts:110-156 asserts clip-count/duration/theme bounds vs fixture _expected and exits 1 on miss;
        margin/grader.test.ts:44-53 verifies the grader is strictly non-increasing / discriminating over a 40-80 case matrix). But the
        A-blocker is UNCHANGED: NO real paid AI round-trip gates a merge. live-eval.yml is NOT a required check (workflow_dispatch + weekly
        cron, not on: pull_request) and stays GREEN keyless (::warning::+pass when ANTHROPIC_API_KEY absent; provider steps `if: env.X != ''`)
        — #289 open with no updates. margin-eval.yml is ADVISORY post-merge cost telemetry (self-labeled :11 NOT a required check, runs only
        on push to main, skips-green keyless, never exits non-zero on low quality). The `ios` check running ExportRoundtripTests is
        explicitly NON-required (ci.yml:125). #471 (atlascloud 5xx/4xx) + #482 (margin fail-safe singleton) added keyless unit coverage but
        neither promoted any real-AI round-trip to a required merge-blocking check.
      gap_to_a: >-
        Make at least one real AI round-trip eval a required, merge-blocking check that hard-fails (non-zero exit) on quality regression
        and cannot pass keyless (#289 — run detect.eval.ts against gold fixtures on PRs with an owner-funded spend-capped ANTHROPIC_API_KEY,
        and flip the keyless ::warning::-and-pass branch to fail); and promote `ios` to a required check so the executing iOS export
        roundtrip actually gates merges. (Tracked: issue #177.)
    - name: performance
      ship_critical: false
      grade: A
      evidence: >-
        Held A. #419 memoization intact: kinetic-text.ts:27,35,39 measureTextCached keyed by (font+text), bounded by
        MEASURE_CACHE_MAX=2048, consumed in the per-frame caption render loops (:333,:502), with a 2100-iteration cap/eviction test
        (kinetic-text.test.ts:321-324). Of the 31 recent commits only 4 touch runtime web code and none adds a hot-path hazard: #496
        templateName bound is an O(1) .length compare before the paid path; #475 validate ceiling is a single O(1) KV incr; ios-score
        frame validation is guarded (>1000 rejected before the O(n) sweep, then MAX_FRAMES_PER_BATCH=35); #482 is test-only. #459 bound
        confirmed (score/route.ts:57 rejects >1000 before the O(n) sweep, then MAX_FRAMES=120). iOS ThumbnailService per-entry LRU intact;
        web asset-cache per-entry 24h TTL + LRU MAX_ENTRIES 50. Web build compiled successfully this run.
      gap_to_a: >-
        (To A+) ONE bounded residual remains (open several cycles): NO Swift test asserting ThumbnailService eviction ORDER
        (`grep -rlin 'thumbnail|accessOrder|evict|maxCacheSize' Tests/` = 0). Add an LRU-eviction ordering test so the
        coldest-key-evicted invariant is locked against regression. (Test-coverage gap, not a perf regression.)
  top_gaps:
    - "store_readiness (C, ship-critical): NO archivable Xcode app target (Package.swift is .library-only — a SwiftPM package cannot produce a submittable IPA; CI has no -exportArchive and the ios job is non-required) and missing 6.9-inch (1320×2868) App Store screenshots/preview — the single dimension keeping ship_gate_met=false. Also placeholder team/app IDs and the consumable credit-pack SKU absent from StoreKitConfiguration.storekit. UNCHANGED for EIGHT cycles; only docs/copy have ever moved. Owner-only Mac work. Tracked: #174, #427."
    - "functional_reality (B, ship-critical): the ACTUAL free-tier shipped export ALWAYS takes the watermark→AVVideoCompositionCoreAnimationTool overlay path (ExportView.swift:275 forces shouldWatermark=true for free users), which has ZERO executing coverage (only config assertions) and hangs on the CI simulator; and the export-COUNT quota is still client-side UserDefaults (AppState.swift:26-33 / SettingsView.swift:200 removeObject, reset by reinstall). Both gaps unchanged. Tracked: #176."
    - "tests_evals (B, ship-critical): eval breadth + the iOS export roundtrip exist and are non-tautological — but NO real paid AI round-trip gates a merge: live-eval.yml is not a required check and stays green keyless (#289), margin-eval.yml is advisory post-merge cost telemetry that never fails on quality regression, and the `ios` check running ExportRoundtripTests is explicitly NON-required (ci.yml:125). Tracked: #177."
```

## How to read this

`overall: B` — a product that keeps **hardening within grade** (the web suite grew to **1124 tests** with coverage at
**93.15% stmts**; security confirmed #496/#475 at cause; correctness verified the #469 ios-validate re-gate drop is a correct fix
with no double-count/bypass; performance absorbed all 31 commits with no hot-path hazard) but is **still not ship-ready**. The ship
gate stays **false** because three ship-critical dimensions remain below the A bar — the same three, on the same root blockers.

**What moved this cycle.** `artifact_integrity` **A+ → A** — the sole grade change, and NOT a product regression. A fresh, verified
finding: the sibling **GTM_SCORECARD** dashboard feed (`docs/growth/GTM_SCORECARD.md:19`) still asserts `ship_gate_met: false` over a
"false '7 kinetic caption styles' claim" that **#493 already fixed** (~3h after the GTM re-grade #491), and it has not been re-graded
since — so a dashboard feed no longer matches reality. This is **conservative staleness in a sibling-owned feed** (the independent GTM
auditor's lagging snapshot), pending that routine's own re-grade — no product overclaim, and the fix belongs to the GTM audit cycle,
not the factory. A+ requires zero findings, so the letter honestly drops to A; A still clears the A bar, so there is **no ship-gate
impact**. Everything else held: `security` **A** (one in-memory-bucket residual), `correctness_reliability` **A** (credit atomicity
still mock-only; 185/185 tests pass), `business_case_strength` **A** (all numbers independently recomputed, reconcile; credit lever
half-shipped), `design_taste` **A+** (emoji-as-UI grep = 0; new 404/CTA surfaces clean), and `performance` **A**.

**Why the gate stays false.** `store_readiness` is still **C** — no archivable Xcode app target (a SwiftPM `.library` cannot be
submitted) and no 6.9-inch App Store screenshots; **open for eight cycles** and only docs/copy have ever moved. `functional_reality`
is **B** — the *actual* free-tier shipped export always takes the watermark→Core-Animation overlay path, which has no executing
coverage and hangs on the CI simulator, and the export-count quota is still client-side/resettable. `tests_evals` is **B** — the
evals exist and are non-tautological, but **no real paid AI round-trip gates a merge**: `live-eval` is not required and stays green
keyless (#289), `margin-eval` is advisory post-merge telemetry that never fails on quality regression, and the `ios` check running
the roundtrip is explicitly non-required. The factory should drive the ordered `top_gaps`, starting with the `store_readiness` C.

Grades are backed by the mechanical signals above (web gate re-run green this run: 1124 tests, coverage enforced, 0 lint, build ok;
main CI green on `a754876`; per-dimension subagent test runs cited) and per-dimension file/line evidence — graded by nine fresh,
independent, adversarial per-dimension subagents (none wrote the code), reconciled with independent auditor judgment. The one grade
change (`artifact_integrity` A+→A) was accepted on an independently re-verified finding (commit ordering + GTM feed staleness
confirmed), not rubber-stamped. No grade exceeds its evidence.
