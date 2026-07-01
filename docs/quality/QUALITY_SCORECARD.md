# HighlightMagic — Quality Scorecard

Independent grade (maker ≠ checker). Graded against `docs/quality/QUALITY_RUBRIC.md`, backed by real
mechanical signals. The factory loop CONSUMES this as DATA — it never authors or self-grades it.

```yaml
# QUALITY_SCORECARD (machine-readable; the factory dashboard reads this block)
QUALITY_SCORECARD:
  as_of: 2026-07-01
  auditor: independent-quality-auditor
  commit: bff8d15
  overall: B            # improved (2 ship-critical dims rose to A) but still NOT ship-ready — store_readiness is C
  ship_gate_met: false  # ship gate needs A/A+ on EVERY ship_critical dim; store_readiness=C, functional_reality=B, tests_evals=B
  mechanical_signals:
    main_ci: green            # required checks (web, web-lint, web-e2e, ios) green on main lineage
    web_gate_this_run: green  # `npm ci && build && test && lint` re-run this run: build ok, 694 tests passed, 0 lint warnings
    web_unit_tests: "694 passed (55 files)"   # up from 617/50 last grade
    ios_build: green          # via required `ios` CI check (Linux auditor cannot xcodebuild)
    coverage_enforced: false  # @vitest/coverage-v8 still NOT installed; vitest.config.ts thresholds unenforced
  dimensions:
    - name: functional_reality
      ship_critical: true
      grade: B
      evidence: >-
        iOS export is genuinely REAL: ExportService.exportClip (Sources/Services/ClipGenerationService.swift:351-603)
        drives a two-pass AVAssetExportSession to a 1080x1920 .mp4 (outputFileType=.mp4, renderSize=targetSize).
        The free-export/entitlement gate MOVED server-side and is now behaviorally tested — entitlement.ts
        (KV-backed quota + StoreKit JWS verification) returns 402/429 before paid calls; ran
        `vitest generation-ceiling-block.test.ts` -> 5 passed asserting 429 blocks the paid call. BUT: grep of
        /Tests for exportClip|.export()|fileExists returns NO matches — no executing test invokes the iOS exporter
        or asserts a playable file (IntegrationTestStubs.swift:54-66 only builds an ExportConfig); and the
        export-COUNT boundary itself (ExportView.swift:258) still gates on client-side appState.canExportFree
        (UserDefaults, resettable by reinstall) — only paid-AI generation is server-gated, not the export count.
      gap_to_a: >-
        Add an outcome-asserting iOS export test (synthesize a small AVURLAsset, call ExportService.exportClip,
        assert a playable 1080x1920 mp4 on disk); and gate the export COUNT server-side (call
        checkExportAllowed/consumeExport on the export path) so the free limit survives reinstall.
    - name: correctness_reliability
      ship_critical: true
      grade: A
      evidence: >-
        All three prior C-grade defects are genuinely fixed WITH a passing regression test (not stubbed).
        poll-manager.ts:27 now holds a `waiters: Waiter[]` array and settleResolve/settleReject (34-39) fan out
        to every duplicate registrant instead of mutating a shared pair; ran
        `vitest run src/lib/poll-manager.test.ts` -> 10/10 pass, incl. the fan-out regression tests
        (poll-manager.test.ts:120,140). StoreKitService.swift:17 replaced nonisolated(unsafe) with a
        @MainActor-clean Task.detached [weak self] listener (111-121) + nonisolated checkVerified (102).
        AI-provider array access is length-guarded everywhere (atlascloud.ts:258 guards before outputs[0] at :264;
        elevenlabs-scribe.ts:112 indexes only inside a length>0 guard). KV reads fail-closed (entitlement.ts:139-153).
      gap_to_a: >-
        (To A+) atlascloud.ts checkTaskResult retries only on 502/503/504 — a network-level fetch rejection or
        AbortSignal.timeout on a poll throws straight out with no retry; absorb transient socket/DNS blips like
        HTTP 5xx. (Also: move the per-user daily ceiling to KV for cross-instance correctness — see security.)
    - name: security
      ship_critical: true
      grade: A
      evidence: >-
        Both prior A+ blockers are CLOSED. iOS direct-provider paths are structurally removed, not just gated:
        ElevenLabsService.swift:27-29 and AtlasCloudService.swift:51-53 hard-return apiKey=nil / isAvailable=false,
        so no env/Keychain/plist key can fire. The quota/spend store is now durable across serverless instances
        (kv-quota-store.ts:24-47 Vercel-KV atomic INCR, 5s timeout, fail-closed reads; entitlement.ts:139-153).
        StoreKit JWS is fully verified (ES256, x5c chain byte-anchored to the owner-supplied Apple root, validity
        windows, never-throws fail-closed) in app-store-jws.ts:82-136; every metered paid route enforces
        rate-limit + generation ceiling + server entitlement BEFORE the provider fetch (score/route.ts:59,68->104);
        nonce+strict-dynamic CSP + HSTS + locked CORS (middleware.ts:45-69, next.config.ts:12-40); Turnstile wired
        (#187); no committed secrets (.env gitignored); ran `vitest` on security suite -> 49/49 pass.
      gap_to_a: >-
        (To A+) rate-limit.ts and spend-ceiling.ts daily ceiling remain in-memory per-instance (only the monthly
        per-user quota is KV-atomic), so cross-instance per-IP throttle / daily-ceiling enforcement is best-effort
        on Vercel's fan-out — move the daily ceiling to KV to fully close per-user cross-instance wallet drain.
    - name: design_taste
      ship_critical: true
      grade: A
      evidence: >-
        Bespoke design tokens, not default Tailwind/shadcn — globals.css:4-20 ports the iOS Theme.swift tokens
        (--bg-primary #0F0A1A, restrained --accent #7C3AED -> --accent-pink #EC4899 used purposefully), explicit
        focus-visible rings (113-124) and 44/48px coarse-pointer touch targets (206-214); iOS type scale
        largeTitle 34 -> caption 12 (Theme.swift:49-53). Real iconography confirmed: lucide-react on web / SF
        Symbols on iOS; adversarial emoji grep found matches ONLY in comments/console/eval logs — ZERO
        emoji-as-UI-icons. Landing a11y strong (role=status aria-live, aria-expanded FAQ, focus-visible). The
        prior to-A+ item is DONE: Photo Animation is now a full glass-card ProToggle (UploadStep.tsx:532-548).
      gap_to_a: >-
        (To A+) Journey screenshots in web/e2e/__screenshots__/ are still desktop-only (7 PNGs, no mobile-viewport
        variants) — add mobile+desktop pairs per step; and give the Turnstile wrapper div an aria-label.
    - name: store_readiness
      ship_critical: true
      grade: C
      evidence: >-
        Two of three prior blockers CLOSED: the iOS direct-provider key paths are hard-disabled
        (ElevenLabsService.swift:27,29 / AtlasCloudService.swift:51,53), and PrivacyInfo.xcprivacy:9-86 now declares
        4 collected data types (Photos/UserID/OtherUserContent/PurchaseHistory) + UserDefaults(CA92.1)/
        FileTimestamp(C617.1) API reasons — accurate to on-device CoreML/Vision usage. StoreKit prices are
        consistent ($14.99/$149.99 across StoreKitConfiguration.storekit:25,47 and SubscriptionProduct.swift:19-20);
        "unlimited" replaced with honest "removes the monthly cap" + disclosed per-day limit. BLOCKERS remaining:
        (1) NO archivable Xcode app target — README.md:45-46 confirms SwiftPM-only, no .xcodeproj/.xcworkspace/
        project.yml exists (verified via find); a SwiftPM package cannot produce a signed IPA for submission.
        (2) Only AppIcon-1024.png exists — screenshots (required 6.9") and preview video are still "⬜ Needed"
        (docs/brand-kit.md:141-148; zero screenshot/preview files found under Sources/Resources or web/public).
      gap_to_a: >-
        Build an archivable Xcode app target (project.yml/xcodegen or .xcodeproj) that produces a signed IPA, and
        commit the required 6.9-inch App Store screenshot set (+ optional preview video), flipping
        docs/brand-kit.md:141-148 from "Needed" to shipped with the real files.
    - name: artifact_integrity
      ship_critical: true
      grade: A
      evidence: >-
        The prior B's sole defect is CLOSED. Both iOS services hard-disable direct-provider paths
        (ElevenLabsService.swift:27, AtlasCloudService.swift:51 -> apiKey=nil/isAvailable=false, every direct-call
        method guards on apiKey), so README.md:21-33's "AI is server-side (business-paid model) — NO user-borne
        portion" framing is now TRUE and the Swift headers proactively disclose the dormant paths. All 3
        dashboard-feed YAML blocks parse (QUALITY_SCORECARD, BUSINESS_CASE_SUMMARY, GROWTH_STATUS). ~15 sampled
        ticked ROADMAP boxes all map to real wired artifacts (rate-limit.ts, spend-ceiling.ts, Turnstile.tsx,
        PrivacyInfo.xcprivacy, growth docs). Marketing is honest — offline/page.tsx:10 states it "needs an
        internet connection for AI video analysis" (no offline-AI overclaim); landing pricing matches shipped caps.
      gap_to_a: >-
        (To A+) Give the machine-readable BUSINESS_CASE_SUMMARY YAML an explicit top-level namespace key (like the
        other two feeds' QUALITY_SCORECARD/GROWTH_STATUS) rather than bare keys under a Markdown H1 — a consistency nit.
    - name: business_case_strength
      ship_critical: true
      grade: A
      evidence: >-
        The prior A->A+ gap is closed: docs/BUSINESS_CASE.md §4 (214-229) now models the Pro column as an explicit
        3%-of-MAU snapshot and a row-by-row recompute matches exactly (M12: 0.03x1429=43, MRR $645; M36:
        0.03x14110=423, MRR $6,341), consistent with 10%/mo MAU growth from 500. Unit economics re-derived
        honestly: 14.99x0.70 - 15x0.31 = $5.84 = 56% GM (annual ~72%), holding against docs/MODEL_COSTS.md (~$0.31).
        BUSINESS_CASE_SUMMARY parses; floor_met_year1=false with base year-1 $7,740 (= M12 MRR x12, not gamed),
        floor ~556 subs = $100,013 ARR; comps cited with sources+dates; 3% conversion within cited 2-5% benchmark.
        Built levers confirmed with 40 passing tests (usage-meter.ts COGS metering, spend-ceiling.ts, entitlement.ts).
      gap_to_a: >-
        (To A+) #221's "monetization MODEL as a first-class lever" is docs-only (4 markdown files; "No model change
        made today") — a listed/evaluated lever, not a built one. Ship a minimal export-credit-pack SKU (StoreKit
        consumable + entitlement path) to convert the flagged COGS-coupling model from prose into a shipped lever.
    - name: tests_evals
      ship_critical: true
      grade: B
      evidence: >-
        Web suite is real, not tautological: 694 tests / 55 files pass; generation-ceiling-block.test.ts:71-127
        asserts BOTH 429 status AND provider.not.toHaveBeenCalled() across 4 routes; atlascloud.test.ts:29-42
        asserts endpoint/headers/body against mocked fetch. Provider-test gap LARGELY closed — new elevenlabs.test.ts
        covers all 6 elevenlabs-* modules, plus atlascloud.test.ts and email/email.test.ts. BUT two load-bearing
        gaps remain: (1) coverage floor UNENFORCED — @vitest/coverage-v8 still absent from package.json,
        `npx vitest run --coverage` dies MISSING DEPENDENCY, and ci.yml:25 runs `npm test` with no --coverage so the
        vitest.config.ts:8-13 thresholds (60/60/50/60) gate nothing; (2) live-eval.yml is scheduled but covers ONLY
        Anthropic detection (line 42), SKIPS+warns green when ANTHROPIC_API_KEY is unset (44-48) and other stages
        don't exist — ROADMAP G3 still `- [ ]` (441). No iOS export-to-file roundtrip test.
      gap_to_a: >-
        Install @vitest/coverage-v8 and add a `--coverage` step to the required `web` CI job so the declared floors
        gate merges (highest-leverage fix); extend live-eval.yml beyond detection to TTS/SFX/music/video-gen with a
        scoring rubric so G3 is genuinely backed; add an iOS export-to-file roundtrip test.
    - name: performance
      ship_critical: false
      grade: B
      evidence: >-
        Web caching is world-class: asset-cache.ts:109-114 does true LRU (sort by ts, evict oldest+expired, 24h TTL);
        poll-manager batches N pollers into one 5s tick with per-waiter fan-out (34-39); frame batching caps at
        MAX_FRAMES_PER_BATCH=35 / MAX_BASE_FRAMES_PER_VIDEO=120 (constants.ts:24-25); SCORING_CONCURRENCY=4 with
        600ms stagger + a real circuit breaker (DetectingStep.tsx:552-570); every paid/slow route declares an
        explicit maxDuration guarded by route-maxduration.test.ts. No new O(n^2)/unbounded-memory risk
        (poll-manager.ts:102 indexOf is over a bounded task set).
      gap_to_a: >-
        (To A) Neither prior to-A item landed — ThumbnailService.swift:33-34 still full-clears the whole cache at 50
        entries (vs per-entry LRU); frame transfer is still base64 JPEG (frame-extractor.ts:350,401,517) vs
        Blob/streaming (~33% payload overhead). Both bounded, non-blocking.
  top_gaps:
    - "store_readiness (C, ship-critical): NO archivable Xcode app target (SwiftPM-only cannot produce a submittable IPA) and missing 6.9-inch screenshots/preview video — the single dimension keeping the product off store-submittable. (Prior blockers 1 & 3 — direct-provider keys, privacy manifest — are now closed.)"
    - "functional_reality (B, ship-critical): no EXECUTING iOS export-to-file test (nothing calls exportClip / asserts a playable mp4), and the export-COUNT quota is still client-side on iOS (resettable by reinstall; only paid-AI generation is server-gated)."
    - "tests_evals (B, ship-critical): coverage floor unenforced (@vitest/coverage-v8 not installed; CI runs no --coverage), and live-eval.yml only covers Anthropic detection and passes green when keyless."
    - "performance (B, non-ship-critical): iOS thumbnail cache full-clears at 50 (vs per-entry LRU); base64 frame transfer (vs Blob/streaming)."
```

## How to read this

`overall: B` — a genuinely improved product that is **not yet ship-ready**. Since the 2026-06-29 baseline, two
ship-critical dimensions rose to A: `correctness_reliability` **C → A** (poll-manager fan-out, StoreKit MainActor
fix, guarded provider arrays — all with passing regression tests) and `artifact_integrity` **B → A** (the iOS
direct-provider paths are hard-disabled, so the docs' server-side framing is now true). `security` and
`design_taste` closed their prior to-A+ items but each retains one real named residual, so they hold at **A**
(near A+). The ship gate stays **false** because three ship-critical dimensions remain below the A bar:
`store_readiness` is **C** (no archivable Xcode app target — a SwiftPM package cannot be submitted — plus missing
screenshots), `functional_reality` is **B** (no executing export test; client-side export-count quota), and
`tests_evals` is **B** (unenforced coverage floor; keyless/partial eval). The factory should drive the ordered
`top_gaps`, starting with the `store_readiness` C. Grades are backed by the mechanical signals above (web gate
re-run green this run — 694 tests passing, 0 lint — required CI green) and per-dimension file/line evidence.
