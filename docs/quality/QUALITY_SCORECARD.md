# HighlightMagic — Quality Scorecard

Independent grade (maker ≠ checker). Graded against `docs/quality/QUALITY_RUBRIC.md`, backed by real
mechanical signals. The factory loop CONSUMES this as DATA — it never authors or self-grades it.

```yaml
# QUALITY_SCORECARD (machine-readable; the factory dashboard reads this block)
QUALITY_SCORECARD:
  as_of: 2026-07-09
  auditor: independent-quality-auditor
  commit: efe1add
  overall: B            # real progress (design_taste A→A+; functional_reality + tests_evals moved UP within-grade as 2/3 and 2/2 of their prior sub-gaps closed) but NOT ship-ready — store_readiness still C, and functional_reality + tests_evals still B (a real named gap each)
  ship_gate_met: false  # ship gate needs A/A+ on EVERY ship_critical dim; store_readiness=C, functional_reality=B, tests_evals=B remain below the A bar
  mechanical_signals:
    main_ci: green            # required checks green on HEAD efe1add (latest 5 main runs all success: web, web-lint, web-e2e, validate-capabilities, validate-gtm, ios)
    web_gate_this_run: green  # `npm ci && test && lint && build` re-run this run: 1029 tests passed, coverage enforced & passing, 0 lint warnings, build compiled successfully
    web_unit_tests: "1029 passed (75 files)"   # up from 956/71 last grade
    coverage_enforced: true   # @vitest/coverage-v8 installed; `test` = `vitest run --coverage`; CI `web` job runs it; v8 thresholds 60/60/50/60 hard-fail below floor
    coverage_this_run: "stmts 91.65% / branch 82.83% / funcs 92.19% / lines 92.94% — all above the 60/60/50/60 floor"
    ios_build: green          # via `ios` CI check (Linux auditor cannot xcodebuild); NOTE ios is a NON-required check (ci.yml) — advisory only
    live_eval_latest: "run 28912951013 = SUCCESS (2026-07-08, workflow_dispatch, head bcebae51) — job logs show Anthropic detect 4/4 + frame-scoring + ElevenLabs TTS (real MP3 bytes) + AtlasCloud/Kling (real MP4 URL) all genuinely EXECUTED; but live-eval is NOT a required check and skips-green when keyless"
  dimensions:
    - name: functional_reality
      ship_critical: true
      grade: B
      evidence: >-
        Prior gap 1 (no EXECUTING iOS export test) is genuinely CLOSED by #378: Tests/HighlightMagicTests/ExportRoundtripTests.swift
        synthesizes a real 640×480 H.264 source via AVAssetWriter (makeSourceVideo:24-74), invokes the PRODUCTION path
        ExportService.shared.exportClip (:127), and asserts INTENDED OUTCOMES — file exists + .mp4 + non-zero size (:130-133),
        decodable video track + non-zero duration (:136-141), and resolved naturalSize.applying(preferredTransform)==1080×1920 vertical
        (:150-157). Real outcome-asserting proof of the plain export journey; CI `ios` green on efe1add. The web e2e journey suite
        asserts real outcomes too (journeys.spec.ts:46/63-71 "Drop your footage"→"You're on the list!", no un-completable dead-end).
        BUT two named gaps persist: (1) the test deliberately runs filter=.none / captionText="" / addWatermark=false, which SKIPS the
        AVVideoCompositionCoreAnimationTool overlay pass (ClipGenerationService.swift:1068-1078, hangs on the simulator) — yet
        ExportView.swift:275 forces shouldWatermark=true for every FREE user, so the actual free-tier shipped export always takes the
        watermark→CALayer overlay path that has ONLY config-level assertions, never an executing render. (2) Export-COUNT quota is still
        client-side on iOS — ExportView.swift:258 gates on appState.canExportFree (AppState.swift:108-113 UserDefaults
        exportsUsedThisMonth), incrementExportCount just bumps the counter AFTER export, and SettingsView.swift:200 even removeObject()s
        it; no server checkExportAllowed/consumeExport before export, so the free limit is trivially reset by reinstall or in-app.
      gap_to_a: >-
        Add an executing export test that drives the OVERLAY pass (addWatermark:true and/or non-empty captionText through
        AVVideoCompositionCoreAnimationTool → a real 1080×1920 mp4) on a device/macOS lane that doesn't hang, so the ACTUAL free-tier
        shipped path is proven end-to-end (not just config-asserted); and gate the export COUNT server-side (checkExportAllowed/consumeExport
        on the export path) so the free limit survives reinstall.
    - name: correctness_reliability
      ship_critical: true
      grade: A
      evidence: >-
        Credit-grant atomicity confirmed as a SINGLE server-side Lua script — credit-store.ts:113-121 REDEEM_AND_GRANT_LUA
        (`SET KEYS[1] '1' NX EX` + `INCRBY KEYS[2]` committed together), no SET-NX-then-INCRBY split write; grant() calls kv.eval once
        inside withTimeout (:142-163), granted===0 unambiguously means replay. Fail-closed verified: entitlement.ts denies on BOTH
        quota-read (:153-169) and credit-read (:183-189) failure; consumeExport is best-effort AFTER the paid run (244-260) so a delivered
        export never 500s. atlascloud.ts retries thrown fetches / 502-504 / parse failures under a sub-60s budget (SUBMIT_OVERALL_BUDGET_MS
        55_000) with guarded outputs[0] access (313-319); poll-manager.ts fans out via Promise.allSettled with per-task waiters[] arrays +
        maxErrors cap, no duplicate-predictionId race. Recent fixes verified at cause: #386 snaps AtlasCloud durations to {5,10} (Kling
        rejects 2s, atlascloud.ts:375-387); #385 PLANNER_EMPTY_RETRIES retries a 200-OK-but-empty SSE stream. `npx vitest run credit-store
        poll-manager atlascloud waitlist-store` → 76 passed (4 files).
      gap_to_a: >-
        (To A+) The credit-grant atomicity — the revenue-critical anti-mint / no-split-write guarantee — is proven ONLY against a mock:
        credit-store.test.ts:116-129 still states it does NOT exercise a real timeout; "split-write safety can only be proven against real
        KV" and the live-KV round-trip stays queued in REMAINING_STEPS.md:255-256 "before the packs go purchasable". Land the live-KV
        integration test proving redeem+grant atomicity + mid-grant-failure recoverability in CI.
    - name: security
      ship_critical: true
      grade: A
      evidence: >-
        Paid-call chain correctly ordered on every paid route: score/route.ts rate-limit(:42) → input bounds(:55-56) → entitlement
        checkExportAllowed(:59) → daily ceiling checkDailySpendCeiling(:68) → server-held process.env.ANTHROPIC_API_KEY(:76, x-api-key
        never client); validate/intro/sfx/animate mirror it. Entitlement is server-authoritative (entitlement.ts:92 verifies StoreKit JWS
        vs Apple root; no client isPro trusted) and fails CLOSED on KV error; spend-ceiling.ts is KV-atomic (kv.incr :142) + fail-closed.
        #392 CONFIRMED: user-id.ts:18 isValidUserId bounds ≤128 chars before every KV-key derivation; MAX_SIGNED_TRANSACTION_CHARS=20_000
        enforced BEFORE ES256 verify; MAX_JWS_CHARS bounded at credits/redeem. #379 CONFIRMED: proxy-video/route.ts:86-99 aborts at
        MAX_RESPONSE_BYTES on ACTUAL streamed bytes (not just Content-Length) + SSRF allowlist HTTPS-only. No committed secrets (grep hits
        only doc-comment placeholders; iOS ElevenLabsService.swift:27 / AtlasCloudService.swift:51 apiKey=nil). Headers strong: next.config.ts
        HSTS/DENY/nosniff + locked CORS; middleware.ts per-request nonce CSP with strict-dynamic, no unsafe-inline, object-src 'none',
        frame-ancestors 'none'. Turnstile CAPTCHA siteverified on waitlist. Error hygiene clean (generic messages, upstream status logged not
        echoed).
      gap_to_a: >-
        (To A+) Two compounding defense-in-depth residuals on the per-IP limiter (NOT wallet-reaching — the authoritative guard is
        server-verified entitlement + KV-atomic fail-closed spend ceilings): (1) rate-limit.ts:28 `const buckets = new Map()` is still
        in-memory per-instance, best-effort across Vercel fan-out; (2) getClientIP takes the leftmost, client-spoofable XFF hop
        (rate-limit.ts:93 `xff.split(",")[0]`), so the per-IP limiter is trivially bypassable by a forged X-Forwarded-For. Back buckets with
        the KV atomic-INCR+TTL pattern already in spend-ceiling.ts and derive the IP from a platform-trusted source (x-real-ip / Vercel's
        appended entry).
    - name: design_taste
      ship_critical: true
      grade: A+
      evidence: >-
        Both prior to-A+ residuals are CLOSED with zero new findings. #397: playwright.config.ts:44-49 adds a second `mobile-chrome`
        project (devices["Pixel 5"], touch, mobile UA) and web/e2e/__screenshots__/mobile-chrome/ holds 7 committed mobile-viewport PNGs
        matching the desktop set (journeys.spec.ts:16-19 routes captures per-project) — the desktop-only-screenshots residual is gone,
        proving the "input dead-simple, output share-worthy" bar on the phone form factor the product targets. #390: globals.css:15
        --text-tertiary rgba(255,255,255,0.5) = 5.29:1 on --bg-primary #0F0A1A (clears WCAG-AA 4.5:1), mirrored in Theme.swift:38.
        Adversarial emoji-as-UI grep across web/src + Sources (incl. arrows/dingbats) → ZERO matches; iconography real (lucide-react in 10
        web files, SF Symbols Image(systemName:) throughout Sources/Views). Bespoke tokens not framework defaults (globals.css:5-11 accent
        #7C3AED / pink #EC4899 exactly mirror Theme.swift:31-32). a11y strong: focus-visible rings (globals.css:114-123), 44/48px touch
        targets (:206-214), Turnstile role="group"+aria-label (Turnstile.tsx:130-131) with no silent bypass.
      gap_to_a: none — A→A+ this cycle (sole prior residual, mobile-viewport screenshots, closed via a real Pixel 5 Playwright project + committed baselines; no new named finding). Hold by re-running the emoji-as-UI grep + a11y token check each grade.
    - name: store_readiness
      ship_critical: true
      grade: C
      evidence: >-
        Both hard submission blockers remain OPEN — the single dimension keeping ship_gate_met=false, UNCHANGED for four cycles.
        (1) NO archivable Xcode app target: `find` for *.xcodeproj/*.xcworkspace/project.yml/Project.swift/*.xcconfig returns ZERO;
        Package.swift:9-14 declares only a .library product (a SwiftPM library cannot emit a signed submittable IPA); ci.yml:151 does
        `xcodebuild ... clean build test` only — grep for exportArchive/archive = no match. (2) Required 6.9-inch (1320×2868) screenshots +
        preview ABSENT — the only device asset is AppIcon-1024.png; every other PNG is a web/Playwright artifact; docs/brand-kit.md:142-143
        still "⬜ Needed" for both. Secondary: StoreKitConfiguration.storekit:6-7 still holds placeholder _developerTeamID "XXXXXXXXXX" /
        _applicationInternalID "1234567890" and products:[] is empty (consumable credit-pack SKU absent). Passing items ARE accurate:
        privacy manifest (PrivacyInfo.xcprivacy, 4 declared data types + API reasons CA92.1/C617.1), usage strings (Info.plist:30-33),
        ITSAppUsesNonExemptEncryption=false, pricing consistent $14.99/$149.99 across every surface, "unlimited" claims honestly qualified.
      gap_to_a: >-
        Add a real archivable iOS APP target (XcodeGen project.yml / Tuist / .xcodeproj wrapping the SwiftPM library, with code-signing) and
        wire `xcodebuild archive -exportArchive` into CI to produce a signed IPA; capture + commit the real 6.9-inch (1320×2868) App Store
        screenshot set + preview, flipping brand-kit.md:142-143 from "Needed" to shipped; replace the placeholder team/app IDs; and add the
        consumable credit-pack SKU to StoreKitConfiguration.storekit.
    - name: artifact_integrity
      ship_critical: true
      grade: A+
      evidence: >-
        All four dashboard-feed YAML blocks parse under real top-level keys (python3 yaml.safe_load): BUSINESS_CASE.md→BUSINESS_CASE_SUMMARY,
        QUALITY_SCORECARD, growth/GROWTH_STATUS→GROWTH_STATUS, growth/GTM_SCORECARD→GTM_SCORECARD. The one claim most likely to overclaim —
        #389 "ElevenLabs + AtlasCloud VALIDATED" (LOOP_HEALTH.md:27) — is HONEST: live-eval run 28912951013 is real (workflow_dispatch,
        conclusion=success, 2026-07-08) AND its job logs (job 85773961893) prove the paid steps genuinely EXECUTED (not skip-guarded by
        `if env.KEY != ''`): detection 4/4 ~$0.28, frame-scoring PASS claude-haiku-4-5, ElevenLabs 2 real calls with real MP3 bytes
        (24703/22613) eleven_flash_v2_5, AtlasCloud real image→video polled processing→completed with a real aliyuncs MP4 URL. Recent
        ticked boxes all map to real wired artifacts: #395 icon-192/512/maskable PNGs exist + referenced in manifest/layout; #393 landing
        layout.tsx:62 real FAQPage JSON-LD from shared faq-data (6 Q&As); #394 opengraph-image.tsx + twitter-image.tsx real ImageResponse
        routes (1200×630). Docs-vs-code consistent: README "no embedded API keys" ↔ iOS apiKey=nil; FREE_EXPORT_LIMIT=5 (constants.ts:8) ↔
        "5 free/mo"; pricing identical across .storekit/landing/faq. Zero overclaim detected.
      gap_to_a: none — A+ held (all four feeds parse; the #389 VALIDATED flip is backed by a real green run whose logs show the paid steps ran). Trivial non-finding: no favicon.ico despite #395's commit message mentioning it, but the manifest/apple-touch icons it references all resolve. Hold by re-parsing all four feeds + spot-verifying each new VALIDATED claim against its cited run each grade.
    - name: business_case_strength
      ship_critical: true
      grade: A
      evidence: >-
        Numbers recompute cleanly with NO gaming (python3): M12 MRR 0.03×1,429×$14.99 = $644.57≈$645 (matches table); ARR year1 base
        43×$14.99×12 = $7,734.84≈$7,740 (matches summary base 7740); floor 556×$14.99×12 = $100,013 (break-even 555.93); unit econ
        $14.99 −$4.50 Apple −$4.65 COGS (15×$0.31) = +$5.84, gross-margin-POSITIVE (55.7% of net-rev, convention stated consistently);
        3% conversion inside the cited 2-5% Userpilot benchmark. Honesty checks PASS: floor_met_year1=false stated plainly; §10 books NO ARR
        for the not-yet-purchasable credit lever (arr frozen with an explicit anti-gaming rationale); §5 volunteers the snapshot count is the
        optimistic end of the cohort range. Comps dated 2026-06-24 with per-row source URLs. The credit-pack lever's BACKEND is real
        (credit-store.ts atomic redeem+grant, /api/credits/redeem Apple-JWS-verified, redeemCreditPack in entitlement.ts:311).
      gap_to_a: >-
        (To A+) The flagship credit-pack lever is still only HALF shipped — `grep -rin "credit|consumable" Sources/` = 0 and
        StoreKitConfiguration.storekit products:[] is empty, so credits are NOT user-purchasable in-app and revenue can't flow. Ship the
        consumable SKUs (credits.small/medium/large) in .storekit AND build the iOS StoreKit consumable purchase→/api/credits/redeem UI in
        Sources/, then recompute base/optimistic ARR with a defensible benchmarked attach rate. (Depends on the store_readiness .storekit fix.)
    - name: tests_evals
      ship_critical: true
      grade: B
      evidence: >-
        Materially improved: 2 of 3 prior sub-gaps CLOSED. (a) Eval BREADTH — web/src/evals/ now has elevenlabs.eval.ts (real generateVoiceover
        round-trip scored by checkTtsResult) + atlascloud.eval.ts (real generatePhotoAnimation scored by checkVideoResult) alongside detect/score;
        the rubric is unit-tested in normal CI (eval-assertions.test.ts drives pass AND fail paths — byte floor/ceiling, non-finite duration,
        over-cap fail-safe); both are wired into live-eval.yml steps 5,6,8,9 and proven GREEN with real paid execution in run 28912951013 (see
        artifact_integrity). (c) iOS export-to-file roundtrip — ExportRoundtripTests.swift executes the real exporter and asserts a playable
        1080×1920 mp4. Coverage floor enforced (test=vitest run --coverage, 60/60/50/60 hard-fail); this run 1029 tests / 75 files pass, coverage
        91.65/82.83/92.19/92.94. Tests are real not tautological (spot-checked generation-ceiling-block + credit-store + eval-assertions).
      gap_to_a: >-
        Sub-gap (b) remains OPEN (the sole A-blocker): the paid-eval validation is ADVISORY, not enforced — live-eval.yml is NOT a required
        check (triggers are workflow_dispatch + weekly cron only) and stays GREEN whether or not any real round-trip ran (Anthropic emits
        `::warning::`+passes when keyless, :51-55; ElevenLabs/AtlasCloud steps silently skip via `if: env.X != ''`, :58/:66 — #289 unresolved).
        AND the `ios` check that runs the new ExportRoundtripTests is explicitly NON-required (ci.yml:125), so it doesn't gate merges. Make the
        paid-eval readiness enforceable (hard-fail when a live-capable provider's key is missing, or add a required readiness gate) so
        "eval exists but never actually executed" can't silently persist, and promote `ios` to a required check.
    - name: performance
      ship_critical: false
      grade: A
      evidence: >-
        Per-entry LRU intact on the iOS thumbnail cache — ThumbnailService.swift:11 accessOrder[String], recordAccess moves key to tail
        (:22-27), eviction drops the coldest via `while cache.count>=maxCacheSize, let oldest=accessOrder.first` (:48-51); the old
        full-clear-at-50 scrub-storm is gone. World-class web caching: asset-cache.ts per-entry 24h TTL + oldest-ts LRU (MAX_ENTRIES 50);
        DetectingStep.tsx SCORING_CONCURRENCY=4 + 600ms stagger + consecutive-failure circuit breaker + Promise.allSettled waves; constants.ts
        MAX_FRAMES_PER_BATCH=35 / MAX_BASE_FRAMES_PER_VIDEO=120 runaway caps. No new O(n²): frame-extractor.ts frameDifference is single-pass
        subsampled (i+=64); scene detection linear bounded by the 120-frame cap; post-processing.ts has no nested loops. Recent PRs (mobile e2e,
        OG card, icons, input bounds) add no hot-path allocation. Web build compiled successfully this run.
      gap_to_a: >-
        (To A+) Two bounded nits, both still open (unfixed since 468dd02): (a) NO Swift test asserting ThumbnailService eviction ORDER
        (grep Tests/ for thumbnail/LRU/evict/accessOrder = 0); (b) kinetic-text.ts:298,467 still call ctx.measureText per-word/per-char,
        unmemoized, inside per-frame render loops (ExportStep.tsx:2110 / TapePreviewPlayer.tsx:702) — a real but bounded per-line cost.
        Add an LRU-eviction ordering test and memoize measureText keyed by (char, ctx.font).
  top_gaps:
    - "store_readiness (C, ship-critical): NO archivable Xcode app target (Package.swift is .library-only — a SwiftPM package cannot produce a submittable IPA; CI has no -exportArchive) and missing 6.9-inch (1320×2868) App Store screenshots/preview — the single dimension keeping ship_gate_met=false. Also placeholder team/app IDs and the consumable credit-pack SKU absent from StoreKitConfiguration.storekit. UNCHANGED for four cycles."
    - "functional_reality (B, ship-critical): the executing plain-path export test (#378) is a real lift, but the ACTUAL free-tier shipped export ALWAYS takes the watermark→AVVideoCompositionCoreAnimationTool overlay path (ExportView.swift:275 forces shouldWatermark=true), which has ZERO executing coverage (only config assertions) and hangs on the CI simulator; and the export-COUNT quota is still client-side UserDefaults (ExportView.swift:258, resettable by reinstall/in-app)."
    - "tests_evals (B, ship-critical): eval breadth (ElevenLabs/AtlasCloud) + iOS export roundtrip now CLOSED and proven green in a real paid live-eval run — but the paid-eval suite is ADVISORY, not enforced: live-eval.yml is not a required check and stays green when keyless (#289), and the `ios` check running ExportRoundtripTests is explicitly NON-required (ci.yml:125), so neither gates merges."
```

## How to read this

`overall: B` — a product that made **real progress** this cycle (`design_taste` **A→A+**; `functional_reality` and `tests_evals`
both moved substantially **up within B** as their prior sub-gaps closed) but is **still not ship-ready**. The ship gate stays **false**
because three ship-critical dimensions remain below the A bar.

**What genuinely moved this cycle.** `design_taste → A+`: the sole prior residual (desktop-only journey screenshots) closed via **#397**
— a real Pixel 5 Playwright project with 7 committed mobile-viewport baselines — plus **#390** raised `--text-tertiary` to clear
WCAG-AA; zero new findings. Within-grade closes: **#378** added an **executing iOS export-to-file roundtrip** proving a playable
1080×1920 mp4 (closing functional_reality gap 1 and tests_evals gap c); **#353/#383/#389** shipped **real ElevenLabs + AtlasCloud
round-trip evals**, wired into `live-eval.yml` and proven GREEN with genuine paid execution in **live-eval run 28912951013** (job logs
show real MP3 bytes + a real Kling MP4 URL — verified, not overclaimed); **#392/#379** hardened input bounds (userId/JWS length,
proxy-video actual-byte cap). The web suite grew to **1029 tests (75 files)** from 956/71, all green with coverage enforced at
**91.65% stmts**; required CI green on `efe1add`.

**Why the gate stays false.** `store_readiness` is still **C** — no archivable Xcode app target (a SwiftPM `.library` cannot be
submitted) and no 6.9-inch App Store screenshots; **both open for four cycles** and the single hard blocker. `functional_reality` is
**B** — the plain-path export test is real, but the *actual* free-tier shipped export always takes the watermark→Core-Animation overlay
path, which has no executing coverage and hangs on the CI simulator, and the export-count quota is still client-side/resettable.
`tests_evals` is **B** — the evals now exist and ran green against real APIs, but the paid-eval suite is *advisory*: `live-eval` is not a
required check and stays green when keyless (#289), and the `ios` check running the new roundtrip is explicitly non-required, so neither
gates a merge. The factory should drive the ordered `top_gaps`, starting with the `store_readiness` C.

Grades are backed by the mechanical signals above (web gate re-run green this run; live-eval run + job logs inspected) and per-dimension
file/line evidence; graded by 9 fresh, independent, adversarial per-dimension subagents (none wrote the code), reconciled with
independent auditor judgment. The one grade most exposed to inflation — `artifact_integrity` A+ resting on the #389 "VALIDATED" flip —
was independently held honest by pulling the live-eval **job logs** to confirm the paid steps genuinely executed rather than being
skip-guarded. No grade exceeds its evidence; no subagent letter was rubber-stamped.
