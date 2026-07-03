# HighlightMagic — Quality Scorecard

Independent grade (maker ≠ checker). Graded against `docs/quality/QUALITY_RUBRIC.md`, backed by real
mechanical signals. The factory loop CONSUMES this as DATA — it never authors or self-grades it.

```yaml
# QUALITY_SCORECARD (machine-readable; the factory dashboard reads this block)
QUALITY_SCORECARD:
  as_of: 2026-07-03
  auditor: independent-quality-auditor
  commit: 709b3b7
  overall: B            # real within-grade progress (coverage floor now enforced; spend ceiling KV-atomic; credit lever backend-built) but NOT ship-ready — store_readiness still C
  ship_gate_met: false  # ship gate needs A/A+ on EVERY ship_critical dim; store_readiness=C, functional_reality=B, tests_evals=B
  mechanical_signals:
    main_ci: green            # required checks (web, web-lint, web-e2e, validate-capabilities, validate-gtm, ios) green on 709b3b7 (latest main run: success)
    web_gate_this_run: green  # `npm ci && test && lint && build` re-run this run: 859 tests passed, coverage enforced & passing, 0 lint warnings, build ok
    web_unit_tests: "859 passed (68 files)"   # up from 694/55 last grade
    coverage_enforced: true   # NEW: @vitest/coverage-v8 ^4.1.9 installed; `test` = `vitest run --coverage`; CI `web` job runs it; v8 thresholds 60/60/50/60 hard-fail below floor
    coverage_this_run: "stmts 77.57% / branch 73.26% / funcs 81.87% / lines 78.49% — all above the 60/60/50/60 floor"
    ios_build: green          # via required `ios` CI check (Linux auditor cannot xcodebuild)
  dimensions:
    - name: functional_reality
      ship_critical: true
      grade: B
      evidence: >-
        iOS export is genuinely REAL: the two-pass AVAssetExportSession → 1080×1920 .mp4 exporter
        (Sources/Services/ClipGenerationService.swift:351,552-588) is intact, and the web e2e journey suite
        asserts real outcomes (web-e2e required check green). BUT both prior ship-critical iOS gaps persist
        UNCHANGED: (1) NO executing export-to-file test — `grep -rn "exportClip|AVURLAsset|fileExists|1920"
        Tests/` returns only config/constant assertions; ExportServiceTests.swift:9-37 constructs an ExportConfig
        and asserts defaultSize==1080×1920, IntegrationTestStubs.swift:54-66 only builds a config — nothing invokes
        the exporter or asserts a playable file on disk. (2) Export-COUNT quota is still CLIENT-SIDE on iOS —
        ExportView.swift:258 gates on appState.canExportFree (UserDefaults exportsUsedThisMonth, AppState.swift:108-128),
        and SettingsView.swift:200 even calls UserDefaults.removeObject(forKey:"exportsUsedThisMonth"), so it is
        trivially resettable / reinstall-bypassable. iOS never calls the server checkExportAllowed (entitlement.ts:128)
        or any /api/credits route before exporting; only paid-AI generation is server-gated, not the export count.
      gap_to_a: >-
        Add an outcome-asserting iOS export test (synthesize a small AVURLAsset, call ExportService.exportClip,
        assert a playable 1080×1920 mp4 on disk: track exists, dimensions, non-zero duration); and gate the export
        COUNT server-side (call checkExportAllowed/consumeExport on the export path) so the free limit survives reinstall.
    - name: correctness_reliability
      ship_critical: true
      grade: A
      evidence: >-
        The prior to-A+ residual is CLOSED: atlascloud.ts:253-266 checkTaskResult now catches a thrown poll fetch
        (network blip / AbortSignal.timeout) and retries with backoff, giving up only after MAX_RETRIES; parse-failure
        (285-296), 5xx (268-283), and the submit path (155-198, with a submitAttemptTimeoutMs serverless-budget guard)
        all retry. Ran `vitest run poll-manager.test.ts atlascloud.test.ts entitlement.test.ts` -> 48/48 pass. Fail-closed
        verified: entitlement.ts denies on quota-read (144-158) and credit-read (175-178) failure; consumeExport flips to
        best-effort only AFTER the paid run completes (230-246). Concurrency sound: credit-store SET-NX + INCRBY +
        negative-clamp (118-147); poll-manager fans out to all waiters + error-cap (57-113); StoreKitService @MainActor +
        nonisolated checkVerified + Task.detached [weak self]. #280/#302 are real timeout/budget fixes.
      gap_to_a: >-
        (To A+) credit-store.ts:118-131 grant is non-atomic: the SET-NX idempotency marker is written BEFORE incrby, so
        if incrby throws (KV timeout) the 400-day marker persists and a client retry returns duplicate=true/granted=0 —
        a paid credit pack can be silently lost (safety-biased: never double-grants; narrow inter-op window). Make the
        marker+increment atomic (or write the marker only after a confirmed increment) so a mid-grant failure is recoverable.
    - name: security
      ship_critical: true
      grade: A
      evidence: >-
        The spend-ceiling half of the prior named residual is CLOSED: spend-ceiling.ts:108-136 now uses a
        VercelKVDailyCeilingStore with atomic kv.incr, TTL, withTimeout fast-reject and fail-closed gates (162-165,181-216),
        so BOTH the export and generation DAILY ceilings are cross-instance KV-atomic (previously in-memory per-instance).
        score/route.ts:41-79 enforces rate-limit -> input bounds -> entitlement(KV) -> daily ceiling -> key -> provider,
        with the key server-held. Error hygiene (#283) verified: routes log resp.status and return generic messages; a grep
        for echoed upstream bodies across api/* + provider libs = zero. JWS fully verified (app-store-jws.ts ES256, x5c
        anchored to trusted root, validity windows, fail-closed null). Credit replay blocked by atomic SET-NX marker
        (credit-store.ts:118-132). Headers strong (HSTS/DENY/nosniff/locked-CORS/nonce+strict-dynamic CSP). iOS direct
        paths dormant (apiKey=nil). No committed secrets (only .env.example). Ran security suite -> 98/98 pass.
      gap_to_a: >-
        (To A+) The per-IP THROTTLE is still in-memory per-instance — rate-limit.ts:28 `const buckets = new Map(...)`,
        the other half of the prior named residual — so cross-instance per-IP abuse-friction is best-effort on Vercel's
        fan-out. The authoritative wallet backstop (monthly quota + daily export/gen ceilings + credit balance) is now all
        KV-atomic + fail-closed, so this is defense-in-depth, not wallet drain — but it is a real named finding, so A not A+.
        Move the per-IP rate-limit buckets to KV to fully close it.
    - name: design_taste
      ship_critical: true
      grade: A
      evidence: >-
        Bespoke design tokens ported cross-platform, not default Tailwind/shadcn — globals.css:4-20 mirrors
        Theme.swift:33-56 (accent #7C3AED / pink #EC4899, glass card, rounded-design SF type scale). Adversarial
        emoji-as-UI grep across web/src + Sources -> ZERO matches; iconography is real (lucide-react on web across
        Header + all 6 step components; Image(systemName:) SF Symbols on iOS). a11y strong: focus-visible rings
        (globals.css:113-124), 44/48px touch targets (206-215), role="alert"/aria across step components. #297 hardened
        the design language. Comfortably clears the A (ship) bar.
      gap_to_a: >-
        (To A+) Both prior to-A+ items remain OPEN, unchanged: (1) journey screenshots are still desktop-only —
        playwright.config.ts:29-38 has a single chromium project = Desktop Chrome; web/e2e/__screenshots__/ is the same
        7 desktop PNGs, no mobile-viewport variants; (2) Turnstile.tsx:126 renders the challenge div with no aria-label
        (landing/page.tsx:124 wrapper also unlabeled). Add mobile+desktop screenshot pairs and an aria-label.
    - name: store_readiness
      ship_critical: true
      grade: C
      evidence: >-
        Both hard submission blockers remain OPEN — this is the single dimension keeping ship_gate_met=false.
        (1) NO archivable Xcode app target: `find` for *.xcodeproj/*.xcworkspace/project.yml/Project.swift returns
        nothing (SwiftPM-only); README.md:47-48 confirms verbatim "an archivable app target for store submission is
        tracked but not yet built"; CI does xcodebuild build+test only, no -exportArchive/IPA. A SwiftPM package cannot
        emit a signed submittable IPA. (2) Required 6.9-inch screenshots + preview ABSENT — only AppIcon-1024.png exists;
        docs/brand-kit.md:141-143 still "⬜ Needed" for the 1320×2868 screenshot set + preview. Secondary: StoreKit prices
        consistent ($14.99/$149.99 across StoreKitConfiguration.storekit, landing/page.tsx:225-227, ExportStep.tsx:1117-1119)
        BUT the .storekit `settings` are placeholders (_developerTeamID "XXXXXXXXXX", _applicationInternalID "1234567890")
        and `products: []` has NO consumable — the credit-pack SKU (CREDIT_PACK_PRODUCTS in credit-store.ts) is unconfigured
        in StoreKit. Privacy manifest accurate (PrivacyInfo.xcprivacy). "Unlimited" claims honestly qualified.
      gap_to_a: >-
        Build an archivable Xcode app target (project.yml/xcodegen or .xcodeproj) that produces a signed IPA; commit the
        real 6.9-inch App Store screenshot set (+ optional preview), flipping docs/brand-kit.md from "Needed" to shipped;
        replace the placeholder team/app IDs; and add the consumable credit-pack product to StoreKitConfiguration.storekit.
    - name: artifact_integrity
      ship_critical: true
      grade: A
      evidence: >-
        All 4 dashboard-feed YAML blocks parse (python3+pyyaml): QUALITY_SCORECARD, growth/GROWTH_STATUS (GROWTH_STATUS),
        growth/GTM_SCORECARD (GTM_SCORECARD). 8 sampled ticked ROADMAP boxes all map to real wired artifacts (H1->rate-limit.ts,
        H7->spend-ceiling.ts, B2 cost meter->validation-cost-metering.test.ts, E6->api/growth+lib/growth, server-side
        model->ElevenLabsService.swift:27 apiKey=nil) — no overclaim. Docs-vs-code consistent: README:24 "no embedded API
        keys" matches iOS apiKey=nil; FREE_EXPORT_LIMIT=5 (constants.ts:8) matches "5 free/mo" marketing. GEMINI_API_KEY
        (#287) is honestly handled — `grep -rn GEMINI web/ Sources` = ZERO hits, so it is correctly ABSENT from
        validation-manifest.ts (whose completeness test enforces every env read is registered) — no media-gen overclaim.
      gap_to_a: >-
        (To A+) The lone residual is unchanged: docs/BUSINESS_CASE.md's machine-readable summary top keys are bare fields
        (currency/arr_year1/...) under an H1; "BUSINESS_CASE_SUMMARY" exists only as a comment (line 2), not a parseable
        top-level namespace key like the other three feeds. Wrap the fields under a real `BUSINESS_CASE_SUMMARY:` key.
    - name: business_case_strength
      ship_critical: true
      grade: A
      evidence: >-
        Real advance from last grade's docs-only lever: the export-credit-pack is now a TESTED, WIRED BACKEND lever —
        credit-store.ts (KV durable balance, atomic INCRBY/SET-NX idempotency), redeemCreditPack (entitlement.ts:271,
        Apple-JWS verify + bundle-id/refund guards, CREDIT_PACK_PRODUCTS 10/30/100), POST /api/credits/redeem, and
        consumption wired into the export gate (entitlement.ts:174 getCreditBalance, :243 consumeCredit); ran its tests ->
        33 pass (3 files). Numbers recompute cleanly with NO gaming: arr_year1 base $7,740 (=M12 MRR $645×12), unit econ at
        $14.99 = 14.99−4.50−4.65 = +$5.84 GM (positive); MAU rows at 10% growth × 3% snapshot conversion reconcile; comps
        sourced+dated (2026-06-24); 2–5% conversion benchmark honored; floor_met_year1=false stated honestly; §10 books
        NO ARR for the not-yet-purchasable lever. Anti-gaming exemplary.
      gap_to_a: >-
        (To A+) The lever is only HALF shipped — the StoreKit CONSUMABLE SKU is absent (StoreKitConfiguration.storekit
        products:[] has no consumable; `grep credit/consumable Sources/` = 0 hits), so credits.* are not user-purchasable
        and revenue still can't flow. Ship the .storekit consumable product + the iOS purchase->redeem call so the lever
        is user-purchasable end-to-end. (Depends on the store_readiness .storekit fix.)
    - name: tests_evals
      ship_critical: true
      grade: B
      evidence: >-
        Gap 1 (coverage floor enforcement) is CLOSED — a genuine lift: package.json `test`=`vitest run --coverage`,
        @vitest/coverage-v8 ^4.1.9 installed, vitest.config.ts:7-16 v8 thresholds 60/60/50/60 with include:["src/lib/**"]
        so weak files count, and the required `web` CI job (ci.yml:24-25) runs `npm test` so a drop below floor hard-fails.
        Ran `npm test` -> 859 tests / 68 files pass; coverage stmts 77.57 / branch 73.26 / funcs 81.87 / lines 78.49, all
        above floor. Tests are real not tautological (generation-ceiling-block.test.ts:71-127 asserts 429 AND
        provider.not.toHaveBeenCalled() per family + a positive control). BUT gap 2 is OPEN on all three sub-parts:
        (a) eval breadth — src/evals holds only detect.eval.ts + score.eval.ts; ElevenLabs/AtlasCloud evals STILL MISSING
        (ROADMAP G3 rung 3 unbuilt); (b) live-eval.yml:44-55 still skips-GREEN via an `if key==''` ::warning:: step
        (issue #289 still valid); (c) NO iOS export-to-file roundtrip test. Low per-file spots masked by the average
        (audio-mux.ts 8.52%, frame-extractor.ts 40.21% — both ship-critical pipeline paths).
      gap_to_a: >-
        Extend the eval suite beyond Anthropic to the ElevenLabs/AtlasCloud round-trips with a scoring rubric and make
        live-eval FAIL (not skip-green) when it can't run; add an iOS export-to-file roundtrip test; and lift coverage on
        the ship-critical low files (audio-mux.ts, frame-extractor.ts) so the healthy aggregate isn't masking uncovered pipeline paths.
    - name: performance
      ship_critical: false
      grade: B
      evidence: >-
        Web caching/batching remains world-class: asset-cache.ts:109-114 true LRU (sort by ts, evict oldest, 24h TTL);
        poll-manager batches pollers with per-waiter fan-out; DetectingStep.tsx:552-570 concurrency=4 + 600ms stagger +
        circuit breaker; constants cap frames (MAX_FRAMES_PER_BATCH=35, MAX_BASE_FRAMES_PER_VIDEO=120) with an adaptive
        interval; bundle 102kB shared / 7.37kB largest route — reasonable. No new O(n²)/memory blowup from the recently
        added render code (transitions/post-processing/kinetic-text: no per-pixel loops).
      gap_to_a: >-
        (To A) Both prior to-A residuals are STILL OPEN after two cycles: ThumbnailService.swift:33-35 full-clears the
        whole cache at 50 entries (cache.removeAll()) vs per-entry LRU — a cold-start re-decode storm on timeline scrub
        (the more impactful, interactive path); frame-extractor.ts:350,401,517 still transfers base64 JPEG
        (toDataURL) vs Blob/streaming (~33% payload overhead). Minor standing nits: post-processing.ts:69-77 reallocs the
        film-grain buffer every frame (GC churn); kinetic-text.ts measureText unmemoized. All bounded, non-blocking.
  top_gaps:
    - "store_readiness (C, ship-critical): NO archivable Xcode app target (SwiftPM-only cannot produce a submittable IPA) and missing 6.9-inch screenshots/preview — the single dimension keeping ship_gate_met=false. Also placeholder team/app IDs and the consumable credit-pack SKU absent from StoreKitConfiguration.storekit."
    - "functional_reality (B, ship-critical): no EXECUTING iOS export-to-file test (nothing calls exportClip / asserts a playable mp4), and the export-COUNT quota is still client-side UserDefaults on iOS (resettable by reinstall; only paid-AI generation is server-gated). UNCHANGED for two cycles."
    - "tests_evals (B, ship-critical): coverage floor is now ENFORCED (closed), but the eval suite still covers only Anthropic (ElevenLabs/AtlasCloud missing), live-eval.yml still skips-green when keyless (#289), and there is no iOS export roundtrip test."
    - "performance (B, non-ship-critical): iOS ThumbnailService full-clears the cache at 50 (vs per-entry LRU); base64 frame transfer (vs Blob/streaming). Both open two cycles."
```

## How to read this

`overall: B` — a product that made real WITHIN-GRADE progress this cycle but is **not yet ship-ready**. No letter
changed since the 2026-07-01 grade, but three named gaps genuinely closed inside their grades: **coverage floors are now
enforced** in the required `web` CI job (`@vitest/coverage-v8` installed; `vitest run --coverage`; 77.57% stmts vs the 60
floor — closes the largest `tests_evals` gap, though eval breadth and the missing iOS roundtrip hold it at B), the
**spend daily-ceiling moved to KV-atomic + fail-closed** (closing the `security` residual's spend half; only the per-IP
throttle stays in-memory, so `security` holds at A), the **atlascloud poll-fetch/timeout retry** now absorbs transient
blips (closing the `correctness` to-A+ item; a new low-severity credit-store non-atomic-grant residual is the successor),
and the **export-credit-pack is now a tested, wired backend lever** (real advance from docs-only, though the StoreKit
consumable SKU is still unshipped so revenue can't flow — `business_case` holds at A). The web suite grew to **859 tests
(68 files)** from 694/55, all green with coverage enforced; required CI is green on `709b3b7`.

The ship gate stays **false** because three ship-critical dimensions remain below the A bar: `store_readiness` is **C**
(no archivable Xcode app target — a SwiftPM package cannot be submitted — plus missing screenshots), `functional_reality`
is **B** (no executing iOS export test; client-side export-count quota — both unchanged for two cycles), and `tests_evals`
is **B** (eval breadth + skip-green + no iOS roundtrip). The factory should drive the ordered `top_gaps`, starting with
the `store_readiness` C. Grades are backed by the mechanical signals above (web gate re-run green this run) and
per-dimension file/line evidence; graded by 9 fresh, independent, adversarial per-dimension subagents (none wrote the code).
