# HighlightMagic — Quality Scorecard

Independent grade (maker ≠ checker). Graded against `docs/quality/QUALITY_RUBRIC.md`, backed by real
mechanical signals. The factory loop CONSUMES this as DATA — it never authors or self-grades it.

```yaml
# QUALITY_SCORECARD (machine-readable; the factory dashboard reads this block)
QUALITY_SCORECARD:
  as_of: 2026-06-29
  auditor: independent-quality-auditor
  commit: a9fe560
  overall: B            # solid product, NOT yet ship-ready (two ship-critical dims below the ship bar)
  ship_gate_met: false  # ship gate needs A/A+ on EVERY ship_critical dim; correctness + store_readiness are C
  mechanical_signals:
    main_ci: green            # web, web-lint, web-e2e, ios all success on HEAD a9fe560
    web_gate_this_run: green  # `npm ci && build && test && lint` re-run this run: build ok, 617 tests passed, 0 lint warnings
    web_unit_tests: "617 passed (50 files)"
    ios_build: green          # via required `ios` CI check (Linux auditor cannot xcodebuild)
  dimensions:
    - name: functional_reality
      ship_critical: true
      grade: B
      evidence: >-
        iOS export is REAL — Sources/Services/ClipGenerationService.swift drives AVAssetExportSession
        to produce a 1080x1920 MP4 (no stub); web e2e (web/e2e/journeys.spec.ts) asserts real UI
        outcomes, not status codes. BUT: web render path (web/src/app/api/render/route.ts:76-84) returns
        501 "render worker not deployed — fallback client" (honest stub, not a producing path); no
        XCUITest proves the full on-device iOS journey; server-side export quota is bypassable on iOS
        (PENDING_OPS: free limit is client-side, reset by reinstall).
      gap_to_a: >-
        Add an outcome-asserting iOS journey test (XCUITest: import -> detect -> edit -> export, assert a
        playable 1080x1920 .mp4 on disk) and move the free-export quota server-side so it can't be reset
        by reinstall.
    - name: correctness_reliability
      ship_critical: true
      grade: C
      evidence: >-
        Targeted units pass (poll-manager/validation-fixes/detection-cache -> 17 passed). Adversarial
        findings: web/src/lib/poll-manager.ts:~127-128 mutates a shared task's resolve/reject when the
        same predictionId is registered twice (callback-chain race); Sources/Services/StoreKitService.swift:17
        uses nonisolated(unsafe) for the update-listener Task on a @MainActor type; AI-response array
        access (e.g. atlascloud.ts outputs[0]) is only partially guarded.
      gap_to_a: >-
        Queue duplicate-predictionId callbacks safely (array of resolvers, not single mutated pair); replace
        nonisolated(unsafe) with a Sendable/MainActor-correct pattern; add explicit empty-array guards on
        every AI provider response before index access.
    - name: security
      ship_critical: true
      grade: A
      evidence: >-
        Server-side entitlement is cryptographically verified (web/src/lib/entitlement.ts verifies StoreKit
        JWS against Apple root CA; no trusted root => free tier); checkExportAllowed() gates BEFORE every
        paid provider call (score/animate/voiceover/... routes; test asserts fetch never called when over
        quota); per-IP rate limit + per-user daily spend ceiling (rate-limit.ts, spend-ceiling.ts: DAILY
        caps); nonce-based CSP + HSTS + X-Frame-Options + locked CORS (middleware.ts, next.config.ts); no
        secrets committed; 147 API security tests pass. Cross-cutting note (see store_readiness): the iOS
        ElevenLabs/AtlasCloud services can call providers DIRECTLY if an embedded key is present, which would
        bypass the server-side gate — gated by isAvailable today, but should be removed from prod builds.
      gap_to_a: >-
        (To A+) Make the quota/spend store durable across serverless instances (Vercel KV) and remove the
        iOS direct-provider-call capability so the server-side gate is the only path.
    - name: design_taste
      ship_critical: true
      grade: A
      evidence: >-
        Intentional design tokens, not default Tailwind/shadcn: explicit type scale + restrained
        purple->pink accent used with purpose (web/src/app/globals.css; Sources/Utilities/Theme.swift);
        real iconography (lucide-react on web, SF Symbols on iOS — zero emoji-as-icons found); genuine a11y
        from #171 (aria-label on waitlist input, role=status aria-live on result, aria-expanded FAQ
        accordion, focus-visible rings, 44-48px touch targets); 7 real committed journey screenshots in
        web/e2e/__screenshots__/.
      gap_to_a: >-
        (To A+) Promote the photo "Animate" disclosure in UploadStep to the same glass-card treatment as the
        Pro-feature toggles for consistency; capture mobile + desktop screenshots for every journey step.
    - name: store_readiness
      ship_critical: true
      grade: C
      evidence: >-
        Info.plist has the photo-library usage strings; StoreKit product IDs/prices ($14.99/mo, $149.99/yr)
        are consistent across StoreKit config, SubscriptionProduct.swift, web, ASO, and BUSINESS_CASE; the
        "unlimited" fair-use cap is now honestly disclosed (#158/#171). BLOCKERS: (1) Sources/Services/
        ElevenLabsService.swift + AtlasCloudService.swift load an API key from env/Keychain/Info.plist and
        will call providers directly if present — contradicts the server-side/business-paid model and is an
        App Store credential-handling risk; (2) ALL ASO assets (icon 1024, screenshots, preview video) are
        still stubbed "Needed" in docs/brand-kit.md; (3) PrivacyInfo.xcprivacy under-declares vs actual
        AVFoundation/CoreML/Vision usage.
      gap_to_a: >-
        Remove (or hard-disable in production builds) the iOS direct-provider key paths and route all gen
        through the backend; produce the real ASO asset set; reconcile the privacy manifest with actual
        framework/API usage.
    - name: artifact_integrity
      ship_critical: true
      grade: B
      evidence: >-
        Spot-checks of ~25 ticked ROADMAP boxes confirm REAL artifacts (rate-limit.ts, spend-ceiling.ts,
        entitlement.ts, CoreMLDetectionService, privacy page, StoreKit pricing, Plausible analytics — all
        present and wired); the three dashboard-feed YAML blocks parse. The DoD boxes are honestly UNCHECKED
        (the loop is not over-claiming readiness — correct). Real defect: the BUSINESS_CASE §1 "every paid
        call is a business COGS line / NO user-borne portion" + README's server-backend framing sit in
        tension with the iOS services' direct-provider-call capability — docs don't disclose that path.
      gap_to_a: >-
        Reconcile the docs with the code: either remove the iOS direct-provider paths (preferred) or
        document them honestly, so README/BUSINESS_CASE match what the iOS binary can actually do.
    - name: business_case_strength
      ship_critical: true
      grade: A
      evidence: >-
        docs/BUSINESS_CASE.md is honest and grounded: BUSINESS_CASE_SUMMARY parses; it openly declares
        floor_met_year1=false (base year-1 ARR ~$7,740 vs $100K floor, crosses ~year 3.2) rather than gaming
        a number. Comps are cited; unit economics are gross-margin-positive (~$0.31 COGS, ~56% GM at
        $14.99). High-ROI levers are BUILT not just listed: Sonnet planner cost fix (ai-models.ts), live
        annual tier (pro.yearly across StoreKit/web/entitlement), provider usage metering for COGS
        observability (usage-meter.ts, #170), spend ceiling (#167).
      gap_to_a: >-
        (To A+) Reconcile the Section-5 subscriber-growth table with the stated conversion x MAU-growth
        assumptions (the table grows slower than the assumptions imply) — one clarifying sentence or a
        corrected table closes it.
    - name: tests_evals
      ship_critical: true
      grade: B
      evidence: >-
        Web unit suite: 617 tests / 50 files pass with real outcome assertions (entitlement reset/consume,
        402 quota gates that assert the paid call is never made, beat-sync numeric precision). Gaps: the AI
        eval suite (web/src/evals/detect.eval.ts, 4 fixtures) is manual-only behind EVAL_MODE=1 and NOT in
        CI / not scheduled (ROADMAP G3 unchecked); vitest.config.ts defines coverage thresholds but
        @vitest/coverage-v8 is not installed so they are unenforced; ~8 provider modules (elevenlabs-*) and
        the email path are untested; iOS tests are config/serialization-level (IntegrationTestStubs notes a
        real video-file test is needed) with no export-to-file roundtrip.
      gap_to_a: >-
        Wire the eval suite into CI on a schedule (regression-gated); install the coverage provider and
        enforce the declared floors; add unit tests for the elevenlabs-* provider modules; add an iOS
        export-to-file roundtrip test.
    - name: performance
      ship_critical: false
      grade: B
      evidence: >-
        Solid: SCORING_CONCURRENCY=4 with staggered launches + circuit breaker (DetectingStep.tsx);
        multi-layer caching (asset-cache 24h TTL/LRU, detection-cache fingerprinted); frame batching caps
        AI calls (MAX_FRAMES_PER_BATCH=35, MAX_BASE_FRAMES_PER_VIDEO=120); batched poll waves (poll-manager,
        5s) instead of N intervals; exponential backoff + stream timeouts; iOS reuses a single export +
        thumbnail cache. Tests for batching/caching pass. No obvious O(n^2) or unbounded memory.
      gap_to_a: >-
        (To A) Per-entry LRU eviction on the iOS thumbnail cache (vs full-clear at 50) and Blob/streaming
        frame transfer instead of base64 (~33% payload reduction) — both bounded, non-blocking.
  top_gaps:
    - "store_readiness (C): remove/disable the iOS ElevenLabs/AtlasCloud direct-provider key paths (App Store credential risk + bypasses the server-side gate); produce the stubbed ASO assets; fix the under-declared privacy manifest."
    - "correctness_reliability (C): fix the poll-manager duplicate-predictionId callback race, the StoreKitService nonisolated(unsafe) Task, and unguarded AI-response array access."
    - "functional_reality (B): add an outcome-asserting iOS export journey test (real .mp4 on device) and move the free-export quota server-side (currently client-side, reset by reinstall)."
    - "tests_evals (B): put the AI eval suite in CI on a schedule, install + enforce coverage thresholds, and test the untested elevenlabs-* provider modules."
    - "artifact_integrity (B): reconcile README/BUSINESS_CASE's server-side AI framing with the iOS direct-provider-call capability."
```

## How to read this
`overall: B` reflects a genuinely solid product (security, design, and the business case grade A) that is
**not yet ship-ready**: two ship-critical dimensions (`correctness_reliability`, `store_readiness`) sit at
**C**, below the ship bar, so `ship_gate_met` is **false**. The factory should drive the ordered
`top_gaps` to close — ship-critical C's first. Grades are backed by the mechanical signals listed above
(main CI green; web gate re-run green this run, 617 tests passing) and the per-dimension file/line evidence.
