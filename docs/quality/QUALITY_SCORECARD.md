# HighlightMagic — Quality Scorecard

Independent grade (maker ≠ checker). Graded against `docs/quality/QUALITY_RUBRIC.md`, backed by real
mechanical signals. The factory loop CONSUMES this as DATA — it never authors or self-grades it.

```yaml
# QUALITY_SCORECARD (machine-readable; the factory dashboard reads this block)
QUALITY_SCORECARD:
  as_of: 2026-07-05
  auditor: independent-quality-auditor
  commit: 468dd02
  overall: B            # real progress (2 dims rose: artifact_integrity A→A+, performance B→A) but NOT ship-ready — store_readiness still C, and functional_reality + tests_evals still B
  ship_gate_met: false  # ship gate needs A/A+ on EVERY ship_critical dim; store_readiness=C, functional_reality=B, tests_evals=B remain below the A bar
  mechanical_signals:
    main_ci: green            # required checks (web, web-lint, web-e2e, validate-capabilities, validate-gtm, ios) green on 468dd02 (latest main run: success)
    web_gate_this_run: green  # `npm ci && test && lint && build` re-run this run: 956 tests passed, coverage enforced & passing, 0 lint warnings, build ok
    web_unit_tests: "956 passed (71 files)"   # up from 859/68 last grade
    coverage_enforced: true   # @vitest/coverage-v8 installed; `test` = `vitest run --coverage`; CI `web` job runs it; v8 thresholds 60/60/50/60 hard-fail below floor
    coverage_this_run: "stmts 91.65% / branch 82.51% / funcs 92.12% / lines 92.79% — all above the 60/60/50/60 floor (up from 77.57/73.26/81.87/78.49)"
    ios_build: green          # via required `ios` CI check (Linux auditor cannot xcodebuild)
  dimensions:
    - name: functional_reality
      ship_critical: true
      grade: B
      evidence: >-
        iOS export is genuinely REAL: the two-pass AVAssetExportSession → 1080×1920 .mp4 exporter
        (Sources/Services/ClipGenerationService.swift:351 func exportClip → ~552-588 outputFileType=.mp4,
        videoComposition targeting ExportConfig.defaultSize 1080×1920) is intact, and the web e2e journey suite
        asserts real outcomes (web-e2e required check green; journeys.spec.ts asserts "You're on the list!" and the
        editor hero render). BUT both prior ship-critical iOS gaps persist UNCHANGED for THREE cycles: (1) NO executing
        export-to-file test — `grep -rn "exportClip|AVURLAsset|fileExists|1920|AVAssetExportSession" Tests/` returns only
        constant/config assertions (ExportServiceTests.swift:15,103 assert ==1920; nothing invokes the exporter or asserts a
        playable file on disk). (2) Export-COUNT quota is still CLIENT-SIDE on iOS — ExportView.swift:258 gates on
        appState.canExportFree (AppState.swift:108-113 UserDefaults exportsUsedThisMonth), and SettingsView.swift:200 even
        calls removeObject(forKey:"exportsUsedThisMonth"); no server checkExportAllowed/consumeExport call before export, so
        the free limit is trivially reset by reinstall (only paid-AI generation is server-gated, not the export count).
      gap_to_a: >-
        Add an outcome-asserting iOS export test (synthesize a small AVURLAsset, call ClipGenerationService.exportClip,
        assert a playable 1080×1920 mp4 on disk: video track exists, naturalSize==1080×1920, non-zero duration); and gate the
        export COUNT server-side (call checkExportAllowed/consumeExport on the export path) so the free limit survives reinstall.
    - name: correctness_reliability
      ship_critical: true
      grade: A
      evidence: >-
        The prior to-A+ residual (non-atomic credit grant) is CLOSED: credit-store.ts:113-154 now runs redeem+grant as a
        SINGLE server-side Lua script (REDEEM_AND_GRANT_LUA: `SET KEYS[1] '1' NX EX` + `INCRBY KEYS[2]` committed together in
        one kv.eval), so the old SET-NX-before-INCRBY split-write is gone and a timed-out redeem is always safe to retry
        (#350). withTimeout(5s) fails the paid path closed. Fail-closed verified: entitlement.ts:142-158/172-178 denies on
        BOTH quota-read and credit-read failure; consumeExport (204-248) is best-effort only AFTER the paid run so a delivered
        export never 500s. atlascloud.ts retries thrown fetches / 502-504 / parse failures under a sub-60s budget with guarded
        outputs[0] access (313-319); waitlist-store.ts wraps every KV op in a fail-fast timeout (#351); poll-manager.ts fans out
        via Promise.allSettled with per-task waiter arrays + maxErrors cap.
      gap_to_a: >-
        (To A+) The atomicity guarantee is proven only against a MOCK — credit-store.test.ts:116-129 explicitly states it does
        NOT exercise a real timeout; split-write safety "can only be proven against real KV" (deferred live-KV round-trip in
        REMAINING_STEPS). Land the live-KV integration test proving redeem+grant atomicity + mid-grant-failure recoverability in
        CI so the revenue-critical path's atomicity is verified, not just structurally asserted.
    - name: security
      ship_critical: true
      grade: A
      evidence: >-
        Paid-call chain correctly ordered on all three routes: score/route.ts rate-limit(:42) → input bounds(:50-56
        MAX_FRAMES/MAX_FRAME_B64_CHARS/MAX_PROMPT_CHARS) → entitlement KV checkExportAllowed(:59) → daily ceiling(:68) →
        server-held key (process.env.ANTHROPIC_API_KEY, x-api-key, never client) → provider; stems + validate mirror it, and
        #318 added a global daily spend ceiling on the anonymous /api/stems route. Both export and generation DAILY ceilings
        are cross-instance KV-atomic + fail-closed (spend-ceiling.ts). Error hygiene holds: routes log upstream status and return
        generic messages; a grep for echoed upstream bodies/keys across api/* + provider libs = zero. No committed secrets (only
        .env.example; iOS ElevenLabsService.swift:27 / AtlasCloudService.swift:51 apiKey=nil). Headers strong: HSTS/DENY/nosniff/
        locked-CORS (next.config.ts) + per-request nonce CSP with strict-dynamic, no unsafe-inline (middleware.ts). Turnstile
        CAPTCHA siteverify on waitlist.
      gap_to_a: >-
        (To A+) The per-IP THROTTLE is still in-memory per-instance — rate-limit.ts:28 `const buckets = new Map(...)` (the file
        self-documents this) — so cross-instance per-IP abuse-friction is best-effort on Vercel's fan-out. The authoritative
        wallet backstop (monthly quota + daily export/gen ceilings + credit balance) is all KV-atomic + fail-closed, so this is
        defense-in-depth, not wallet drain — but a real named finding, so A not A+. Move the per-IP buckets to a KV-atomic counter.
    - name: design_taste
      ship_critical: true
      grade: A
      evidence: >-
        Bespoke design tokens ported cross-platform, not default Tailwind/shadcn — globals.css:9-11 mirrors Theme.swift:31-32
        (accent #7C3AED / pink #EC4899). Adversarial emoji-as-UI grep across web/src + Sources → ZERO matches; iconography is
        real (lucide-react web, SF Symbols iOS). a11y strong: focus-visible rings (globals.css:113-122), 44px touch targets
        (:213), role="alert"/aria-live on core surfaces. The prior to-A+ CAPTCHA-a11y item is CLOSED (#346): Turnstile.tsx:126-132
        now renders role="group" aria-label="CAPTCHA verification challenge"; landing/page.tsx:107 email input aria-labeled with
        role="alert" errors. Comfortably clears the A (ship) bar.
      gap_to_a: >-
        (To A+) One prior to-A+ item remains OPEN: journey screenshots are still desktop-only — playwright.config.ts:29-37 is a
        single chromium project = Desktop Chrome, and web/e2e/__screenshots__/ holds 7 desktop-only PNGs with no mobile-viewport
        variants. Add a second Playwright project (e.g. Pixel 5 / iPhone 13) so the journey suite proves the "input dead-simple,
        output share-worthy" bar on the phone form factor the product actually targets.
    - name: store_readiness
      ship_critical: true
      grade: C
      evidence: >-
        Both hard submission blockers remain OPEN — this is the single dimension keeping ship_gate_met=false. (1) NO archivable
        Xcode app target: `find` for *.xcodeproj/*.xcworkspace/project.yml/Project.swift/*.xcconfig returns nothing; Package.swift:9-14
        declares only a .library product + test target (a SwiftPM library cannot emit a signed submittable IPA); README.md:49-50
        confirms verbatim "an archivable app target for store submission is tracked but not yet built"; CI ci.yml:151 does
        xcodebuild clean build test only — no -exportArchive/-archivePath/IPA. (2) Required 6.9-inch screenshots + preview ABSENT —
        only Sources/Resources/Assets.xcassets/AppIcon-1024.png exists (every other PNG is a web/Playwright/coverage artifact); no
        1320×2868 file; docs/brand-kit.md:141-143 still "⬜ Needed" for the screenshot set + preview. Secondary: StoreKitConfiguration.storekit
        settings are placeholders (_developerTeamID "XXXXXXXXXX", _applicationInternalID "1234567890") and products:[] is empty — the
        consumable credit-pack SKU is unconfigured. Prices consistent ($14.99/$149.99 across .storekit, landing, ExportStep, JSON-LD).
        Privacy manifest accurate (PrivacyInfo.xcprivacy; NSPhotoLibrary usage strings in Info.plist:30,32). "Unlimited" claims honestly qualified.
      gap_to_a: >-
        Build an archivable Xcode app target (project.yml/xcodegen or .xcodeproj) that produces a signed IPA and wire -exportArchive
        into CI; commit the real 6.9-inch (1320×2868) App Store screenshot set + 1080×1920 preview, flipping docs/brand-kit.md from
        "Needed" to shipped; replace the placeholder team/app IDs; and add the consumable credit-pack product to StoreKitConfiguration.storekit.
    - name: artifact_integrity
      ship_critical: true
      grade: A+
      evidence: >-
        The lone prior residual is CLOSED and no new finding replaced it. All FOUR dashboard-feed YAML blocks now parse
        (python3+pyyaml) AND each wraps under a real top-level namespace key: BUSINESS_CASE.md → BUSINESS_CASE_SUMMARY (#345 — now a
        genuine col-0 key, not a comment), QUALITY_SCORECARD, growth/GROWTH_STATUS → GROWTH_STATUS, growth/GTM_SCORECARD → GTM_SCORECARD
        — one parse convention across all four. 8 sampled ticked ROADMAP boxes all map to real wired artifacts (H7→spend-ceiling.ts,
        §10 credit packs→credit-store.ts + redeemCreditPack + api/credits/redeem, H5→Turnstile.tsx+waitlist, E8→growth/experiments.ts
        real two-proportion significance test, #343 JSON-LD, #340 experiment engine) — no overclaim. Docs-vs-code consistent: README
        "no embedded API keys" matches iOS apiKey=nil; FREE_EXPORT_LIMIT=5 (constants.ts:8) matches "5 free/mo"; pricing identical across
        .storekit/SubscriptionProduct/AppStoreMetadata/ExportStep/landing/JSON-LD. Env manifest complete — the only apparent gap
        (NEXT_PUBLIC_SUPABASE_URL) appears solely in a guard test excluded by the manifest's SKIP_FILE regex. Zero findings; the docs
        honestly disclose what is NOT done (app target, floor_met=false, dormant paths) — exemplary integrity.
      gap_to_a: none — A+ earned this cycle (sole prior residual resolved; no new overclaim from #349/#343/#340). Hold by re-parsing all four feeds each grade.
    - name: business_case_strength
      ship_critical: true
      grade: A
      evidence: >-
        Numbers recompute cleanly with NO gaming: M12 MRR = 0.03×1,429×$14.99 = $643/mo ×12 ≈ arr_year1.base 7,740 (BUSINESS_CASE.md:9);
        every §5 row reconciles as a 3%-of-MAU snapshot at 10%/mo growth; floor math 556×$14.99×12 = $100,013; unit econ at $14.99 =
        14.99−4.50 (30% Apple) −4.65 (15×$0.31 COGS) = +$5.84 (~56% GM), gross-margin-positive; conversion 3% inside the cited 2-5%
        benchmark; comps dated 2026-06-24. floor_met_year1=false stated honestly (not gamed) and §10 books NO ARR for the not-yet-
        purchasable credit lever. The export-credit-pack is a TESTED, WIRED backend lever (credit-store.ts KV durable balance,
        redeemCreditPack Apple-JWS verify, /api/credits/redeem, consumption in the export gate; made atomic in #350).
      gap_to_a: >-
        (To A+) The flagship lever is still only HALF shipped — the StoreKit CONSUMABLE SKU is absent (`grep -rn "consumable|credit"
        Sources/` = 0; StoreKitConfiguration.storekit products:[] empty), so credits are not user-purchasable and revenue can't flow.
        Ship the .storekit consumable product + the iOS purchase→/api/credits/redeem call so the lever is user-purchasable end-to-end,
        then recompute base/optimistic ARR with a defensible attach rate. (Depends on the store_readiness .storekit fix.)
    - name: tests_evals
      ship_critical: true
      grade: B
      evidence: >-
        Coverage floor enforcement + the low-file sub-issue are CLOSED — a genuine lift: `test`=`vitest run --coverage`, v8 thresholds
        60/60/50/60 hard-fail below floor, and this run: 956 tests / 71 files pass, coverage stmts 91.65 / branch 82.51 / funcs 92.12 /
        lines 92.79 (up from 77.57/73.26/81.87/78.49); the two prior ship-critical low files are now covered (frame-extractor.ts 97.82%,
        audio-mux.ts 99.22% — were 40.21%/8.52%, closed by #322-#325). Tests are real not tautological (generation-ceiling-block.test.ts:78-79
        asserts 429 AND provider.not.toHaveBeenCalled() per route + a positive control; credit-store.test.ts asserts idempotent replay +
        floor-at-zero). BUT prior gap 2 remains OPEN on all three sub-parts on HEAD: (a) eval breadth — `ls web/src/evals/` = only
        detect.eval.ts + score.eval.ts; ElevenLabs/AtlasCloud evals MISSING (the "test(evals): ElevenLabs+AtlasCloud G3" branch is queued
        in CI but NOT merged — not credited); (b) live-eval.yml:48-53 still skips-GREEN via `if key==''` ::warning:: (issue #289 unfixed);
        (c) NO iOS export-to-file roundtrip test (grep Tests/ empty).
      gap_to_a: >-
        Merge the ElevenLabs/AtlasCloud round-trip evals into web/src/evals (span all three paid providers); change live-eval.yml so a
        missing key hard-FAILS (or the job is required) instead of ::warning::+green (close #289); and add an executing iOS export-to-file
        roundtrip test (AVAssetExportSession → assert output fileExists + 1080×1920 + non-zero duration).
    - name: performance
      ship_critical: false
      grade: A
      evidence: >-
        Prior to-A residual (1) is genuinely CLOSED with proper per-entry LRU: ThumbnailService.swift:8-12 carries an
        accessOrder[String] array in lockstep with the cache, records access on hit (:32-34), and evicts the COLDEST entry
        (:48-51 `while cache.count>=maxCacheSize { removeFirst; removeValue }`) instead of cache.removeAll() at 50 (#354) — the
        cold-start re-decode scrub-storm is gone. Residual (2) (base64 frame transfer, frame-extractor.ts:350,401,517 toDataURL) is
        judged non-binding: those frames feed the Anthropic Vision API, whose image content blocks REQUIRE base64 (source.type=base64),
        and extraction+scoring share one JS context with no worker postMessage transfer — a Blob would just be re-encoded, so the
        "33% overhead" framing doesn't bind. World-class web caching intact: asset-cache.ts:79-115 per-entry TTL+oldest-ts LRU;
        DetectingStep.tsx concurrency=4 + 600ms stagger + circuit breaker; MAX_FRAMES caps (constants.ts). No new O(n²)/per-frame
        blowup; the prior film-grain realloc nit is fixed (post-processing.ts:61-67 caches the downsampled grain canvas).
      gap_to_a: >-
        (To A+) Two bounded nits: (a) no Swift test asserting LRU eviction ORDER (ThumbnailService.swift:48 — grep Tests/ for
        thumbnail/LRU/evict = 0); (b) kinetic-text.ts:298,467 still call ctx.measureText per-char/per-frame unmemoized — a real but
        bounded per-line cost, not a blowup. Add an LRU-eviction ordering test and memoize measureText.
  top_gaps:
    - "store_readiness (C, ship-critical): NO archivable Xcode app target (Package.swift is .library-only — a SwiftPM package cannot produce a submittable IPA) and missing 6.9-inch (1320×2868) screenshots/preview — the single dimension keeping ship_gate_met=false. Also placeholder team/app IDs and the consumable credit-pack SKU absent from StoreKitConfiguration.storekit. Unchanged for three cycles."
    - "functional_reality (B, ship-critical): no EXECUTING iOS export-to-file test (nothing calls exportClip / asserts a playable 1080×1920 mp4), and the export-COUNT quota is still client-side UserDefaults on iOS (resettable by reinstall; only paid-AI generation is server-gated). Unchanged for three cycles."
    - "tests_evals (B, ship-critical): coverage floor + low-file coverage now CLOSED (91.65% stmts; frame-extractor/audio-mux covered), but the eval suite still covers only Anthropic (ElevenLabs/AtlasCloud absent on main — the G3 branch is queued, not merged), live-eval.yml still skips-green when keyless (#289), and there is no iOS export roundtrip test."
```

## How to read this

`overall: B` — a product that made **real progress** this cycle (two dimensions rose: `artifact_integrity` **A→A+**, `performance`
**B→A**) but is **still not ship-ready**. The three ship-critical dimensions below the A bar are all **unchanged**, so the ship gate
stays false. What genuinely moved: **artifact_integrity → A+** — the sole prior residual (BUSINESS_CASE_SUMMARY namespace key) closed
via #345, all four dashboard feeds now parse under a real top-level key, and 8 sampled ticked boxes all back real wired artifacts with
zero overclaim; **performance → A** — the iOS thumbnail full-clear-at-50 was replaced by proper per-entry LRU (#354,
ThumbnailService.swift:48-51), and the remaining base64-frame finding is non-binding because the Anthropic Vision API requires base64
anyway. Within-grade closes this cycle: the **credit grant is now a single atomic KV Lua script** (#350, closing the correctness to-A+
race), the **CAPTCHA is a11y-labeled** (#346, closing a design_taste to-A+ item), and the **two ship-critical low-coverage files
(frame-extractor 97.82%, audio-mux 99.22%) are covered** (#322-#325). The web suite grew to **956 tests (71 files)** from 859/68, all
green with coverage enforced at **91.65% stmts** (up from 77.57%); required CI is green on `468dd02`.

The ship gate stays **false** because three ship-critical dimensions remain below the A bar: `store_readiness` is **C** (no archivable
Xcode app target — a SwiftPM `.library` package cannot be submitted — plus missing 6.9-inch screenshots; both open three cycles),
`functional_reality` is **B** (no executing iOS export test; client-side export-count quota — both open three cycles), and `tests_evals`
is **B** (eval breadth: ElevenLabs/AtlasCloud evals are queued on a branch but not merged; live-eval skips-green keyless #289; no iOS
roundtrip). The factory should drive the ordered `top_gaps`, starting with the `store_readiness` C. Grades are backed by the mechanical
signals above (web gate re-run green this run) and per-dimension file/line evidence; graded by 9 fresh, independent, adversarial
per-dimension subagents (none wrote the code), reconciled with independent auditor judgment (two subagent upgrades accepted on verified
file/line evidence; none inflated).
