# HighlightMagic — Quality Scorecard

Independent grade (maker ≠ checker). Graded against `docs/quality/QUALITY_RUBRIC.md`, backed by real
mechanical signals. The factory loop CONSUMES this as DATA — it never authors or self-grades it.

```yaml
# QUALITY_SCORECARD (machine-readable; the factory dashboard reads this block)
QUALITY_SCORECARD:
  as_of: 2026-07-11
  auditor: independent-quality-auditor
  commit: 8b0b04b
  overall: B            # unchanged: real within-grade hardening (security #403 spoof-resistant IP, perf #419 measureText memo) but NOT ship-ready — store_readiness still C, functional_reality + tests_evals still B (a real named gap each)
  ship_gate_met: false  # ship gate needs A/A+ on EVERY ship_critical dim; store_readiness=C (5 cycles), functional_reality=B, tests_evals=B remain below the A bar
  mechanical_signals:
    main_ci: green            # required checks green on HEAD 8b0b04b (latest 8 main CI runs all success: web, web-lint, web-e2e, validate-capabilities, validate-gtm, ios)
    web_gate_this_run: green  # `npm ci && test && lint && build` re-run this run: 1070 tests passed, coverage enforced & passing, 0 lint warnings, build compiled successfully
    web_unit_tests: "1070 passed (76 files)"   # up from 1029/75 last grade
    coverage_enforced: true   # @vitest/coverage-v8 installed; `test` = `vitest run --coverage`; CI `web` job runs it; v8 thresholds 60/60/50/60 hard-fail below floor
    coverage_this_run: "stmts 92.41% / branch 83.73% / funcs 92.55% / lines 93.77% — all above the 60/60/50/60 floor"
    ios_build: green          # via `ios` CI check (Linux auditor cannot xcodebuild); NOTE ios is a NON-required check (ci.yml:125 kept non-required until reliably green) — advisory only
    live_eval_latest: "prior run 28912951013 = SUCCESS (2026-07-08) with real paid execution; live-eval is NOT a required check and skips-green when keyless (#289 unresolved)"
  dimensions:
    - name: functional_reality
      ship_critical: true
      grade: B
      evidence: >-
        UNCHANGED — both named gaps persist. (1) The executing iOS export test (#378
        ExportRoundtripTests.swift) still drives ONLY the plain path: :119-123 sets filter=.none / captionText="" /
        addWatermark=false, and its own comment (:108-112) concedes the caption/watermark overlay pass is
        Core-Animation and hence skipped (simulator hangs). Yet ExportView.swift:275 STILL forces
        `shouldWatermark = appState.isProUser ? addWatermark : true` — every FREE user's shipped export takes the
        watermark→AVVideoCompositionCoreAnimationTool overlay path, which has ONLY config-level assertions
        (ExportServiceTests.swift:25-35 asserts config.addWatermark==true, never an executing render). So the ACTUAL
        free-tier shipped export path is still never proven end-to-end. (2) Export-COUNT quota is still client-side:
        AppState.swift:26-27 exportsUsedThisMonth persists to UserDefaults, :109 canExportFree gates on it, and
        SettingsView.swift:200-201 removeObject()s it — trivially reset by reinstall/in-app. No server
        checkExportAllowed/consumeExport on the export-count path (grep Sources/ = 0). Web e2e journey suite green.
      gap_to_a: >-
        Add an executing export test that drives the OVERLAY pass (addWatermark:true and/or non-empty captionText
        through AVVideoCompositionCoreAnimationTool → a real 1080×1920 mp4) on a device/macOS lane that doesn't hang, so
        the ACTUAL free-tier shipped path is proven end-to-end (not just config-asserted); and gate the export COUNT
        server-side (checkExportAllowed/consumeExport on the export path) so the free limit survives reinstall.
    - name: correctness_reliability
      ship_critical: true
      grade: A
      evidence: >-
        Held A (fresh adversarial grader, 133/133 tests pass: `npx vitest run credit-store poll-manager atlascloud
        velocity entitlement` → 6 files, 133 passed). Recent fixes verified genuine at cause: #435 exports
        SFX/TTS_GENERATION_TIMEOUT_MS=26_000 fired via AbortSignal.timeout, strictly under maxDuration=30
        (elevenlabs-sfx.ts:25,74 / elevenlabs-tts.ts:23,108) — a real timeout-inversion fix; #436 velocity.ts:191-194
        guards avgSpeed<0.01→return sourceDuration against Infinity; #406 audio-mux.ts applies AUDIO_FETCH_TIMEOUT_MS=30_000
        to all three asset fetches. poll-manager.ts:27-39/92-93/133-141 per-task waiters[] with delete-before-settle and
        duplicate-predictionId piggyback — no duplicate-callback hazard. entitlement.ts:155-169/186-189 fails CLOSED on
        both quota- and credit-read KV errors; consumeExport best-effort AFTER the paid run (:244-261). atlascloud.ts
        retries 5xx/thrown/parse under a bounded budget with guarded outputs[0] (:313-319).
      gap_to_a: >-
        (To A+) UNCHANGED residual: the revenue-critical credit-grant atomicity (single Lua SET-NX+INCRBY,
        credit-store.ts:113-121) is proven ONLY against a mock — credit-store.test.ts explicitly concedes it "does NOT
        exercise a real timeout" and "split-write safety can only be proven against real KV"; the live-KV round-trip stays
        queued in REMAINING_STEPS.md "before the packs go purchasable". Land the live-KV integration test in CI.
    - name: security
      ship_critical: true
      grade: A
      evidence: >-
        Held A (fresh adversarial grader). #403 CONFIRMED FIXED: rate-limit.ts:101-110 getClientIP now prefers Vercel's
        unspoofable x-real-ip, else the RIGHTMOST XFF hop (parts[parts.length-1]:107) — the leftmost-spoof residual is
        closed. Paid-call chain correctly ordered on score/route.ts: rate-limit(:41-43) → input bounds(:47-56) →
        entitlement checkExportAllowed(:59-65) → daily ceiling(:68-74) → server-held ANTHROPIC_API_KEY via x-api-key(:76,107),
        never client. Entitlement server-authoritative (entitlement.ts:92-117 Apple-root ES256 JWS verify, empty root→deny,
        no client isPro) and fails CLOSED on KV error; spend-ceiling.ts KV-atomic kv.incr(:142) + fail-closed. #420 bounds
        every free-text field before the paid validate call (validate/route.ts:66-87) + assembled-prompt backstop(:247);
        user-id ≤128 chars (user-id.ts:11-20). No committed secrets (grep hits only header field-name literals + a test
        placeholder). Headers strong: middleware.ts:45-69 nonce+strict-dynamic CSP, no unsafe-inline, object-src/frame-ancestors
        'none'; next.config.ts HSTS preload + DENY + locked CORS.
      gap_to_a: >-
        (To A+) ONE compounding residual now remains (down from two): rate-limit.ts:28 `const buckets = new Map()` is still
        in-memory per-serverless-instance (header comment concedes this), so an attacker fanned across N instances gets ~N×
        the per-IP throttle. Defense-in-depth only — the authoritative wallet guards (server-verified entitlement + KV-atomic
        fail-closed spend ceiling) are both cross-instance, so the drain is hard-bounded regardless. Back buckets with the KV
        atomic-INCR+TTL pattern already in spend-ceiling.ts.
    - name: design_taste
      ship_critical: true
      grade: A+
      evidence: >-
        Held A+ with zero new findings. Adversarial emoji-as-UI grep across web/src + Sources/Views (incl.
        arrows/dingbats/symbols U+2190–U+2BFF, U+1F300–U+1FAFF) → ZERO matches; iconography real (lucide-react in 10 web
        files, SF Symbols Image(systemName:) in 14 Sources/Views files). Bespoke tokens not framework defaults, exactly
        mirrored web↔iOS: globals.css:9-11 --accent #7C3AED / --accent-pink #EC4899 == Theme.swift:31-32 accent/accentPink.
        #390 --text-tertiary rgba(255,255,255,0.5) = 5.29:1 on --bg-primary (clears WCAG-AA). #409 put brand design tokens on
        the global error page. a11y strong: focus-visible rings, 44/48px touch targets, Turnstile role="group"+aria-label.
        #410 corrected the store screenshot headline 7→6 to match the 6-pass UI users see (honesty, not slop).
      gap_to_a: none — A+ held (emoji-as-UI grep = 0; real iconography; bespoke tokens mirrored; a11y intact; no new finding). Hold by re-running the emoji-as-UI grep + a11y token check each grade.
    - name: store_readiness
      ship_critical: true
      grade: C
      evidence: >-
        UNCHANGED for FIVE cycles — the single dimension keeping ship_gate_met=false; only a DOC moved this window (#426
        added docs/ios/APP_TARGET_SETUP.md, a ~20-min Mac-job writeup — not an actual target). (1) NO archivable Xcode app
        target: `find` for *.xcodeproj/*.xcworkspace/project.yml/Project.swift/*.xcconfig returns ZERO; Package.swift declares
        only a .library product (a SwiftPM library cannot emit a signed submittable IPA); ci.yml does `xcodebuild ... clean
        build test` only, no -exportArchive. (2) Required 6.9-inch (1320×2868) screenshots + preview ABSENT — brand-kit.md:142-143
        still "⬜ Needed"; every committed device PNG is a web/Playwright artifact or an icon. (3) StoreKitConfiguration.storekit:4-8
        still holds placeholder _developerTeamID "XXXXXXXXXX" / _applicationInternalID "1234567890" and products:[] is empty
        (consumable credit-pack SKU absent). Passing items ARE accurate: privacy manifest (4 declared data types + API reasons),
        usage strings, ITSAppUsesNonExemptEncryption=false, pricing consistent $14.99/$149.99, "unlimited" claims honestly qualified.
      gap_to_a: >-
        Add a real archivable iOS APP target (XcodeGen project.yml / Tuist / .xcodeproj wrapping the SwiftPM library, with
        code-signing) and wire `xcodebuild archive -exportArchive` into CI to produce a signed IPA; capture + commit the real
        6.9-inch (1320×2868) App Store screenshot set + preview, flipping brand-kit.md:142-143 from "Needed" to shipped; replace
        the placeholder team/app IDs; and add the consumable credit-pack SKU to StoreKitConfiguration.storekit. (Owner-only Mac
        work per docs/ios/APP_TARGET_SETUP.md.)
    - name: artifact_integrity
      ship_critical: true
      grade: A
      evidence: >-
        A+ → A this cycle on ONE fresh, trivial, newly-introduced doc-vs-doc numeric nit surfaced by the independent grader.
        Everything else is exemplary: all four dashboard-feed YAML blocks parse under real top-level keys (python3 yaml.safe_load:
        QUALITY_SCORECARD, BUSINESS_CASE→BUSINESS_CASE_SUMMARY, growth/GROWTH_STATUS, growth/GTM_SCORECARD). Pricing uniform
        $14.99/$149.99 across .storekit:25,47 / SubscriptionProduct.swift / landing / faq / press-kit / email / BUSINESS_CASE —
        zero drift. "unlimited" claims honestly qualified everywhere ("no monthly cap / 50-per-day fair-use ceiling"; README:45,
        landing:232, terms:53, support:83). #410 store headline "6-Pass" matches the 6-pass ProcessingView UI (backend runs 7
        stages, so the user-facing 6 is if anything conservative — no overclaim). Committed PNGs are only icons + e2e regression
        snapshots; brand-kit honestly marks device screenshots ⬜ Needed (nothing claimed shipped).
      gap_to_a: >-
        Reconcile the one stale historical-narrative line REMAINING_STEPS.md:112 ("the '7-pass' language is literally accurate")
        with #410's user-facing "6-Pass" store correction. Defensible (7 = backend stage count vs 6 = UI-displayed passes), and
        purely a doc-vs-doc inconsistency on the exact number #410 just corrected — a trivial one-line fix restores zero-findings A+.
    - name: business_case_strength
      ship_critical: true
      grade: A
      evidence: >-
        Held A — every load-bearing number independently recomputed (python3) and reconciles, no gaming: M12 MRR
        43×$14.99=$644.57≈$645 (matches §4 table); ARR year1 base 43×$14.99×12=$7,734.84≈$7,740 (matches arr_year1.base:7740);
        floor 556×$14.99×12=$100,013 and 100000/(14.99×12)=555.9 subs (the "~556 Pro subs" claim is exact); unit econ net
        $10.49−$4.65 COGS=+$5.84/user/mo gross-margin-POSITIVE (55.7% of net-rev, convention stated). Conversion 3% inside the
        cited 2-5% Userpilot benchmark; comps dated (fetched 2026-06-24) with per-row source URLs. Honesty PASS:
        floor_met_year1=false stated plainly; §10 books $0 ARR for the not-yet-purchasable credit lever and explicitly refuses
        to invent an attach rate. Credit-pack BACKEND is real (credit-store.ts atomic redeem+grant, /api/credits/redeem
        Apple-JWS-verified, CREDIT_PACK_PRODUCTS 10/30/100 in constants.ts:28).
      gap_to_a: >-
        (To A+) UNCHANGED: the flagship credit-pack lever is still only HALF shipped — `grep -rin "credit|consumable" Sources/`
        = 0 and StoreKitConfiguration.storekit products:[] is empty, so credits are NOT user-purchasable in-app and revenue can't
        flow. Ship the consumable SKUs in .storekit AND build the iOS StoreKit consumable purchase→/api/credits/redeem UI, then
        recompute base/optimistic ARR with a defensible benchmarked attach rate. (Depends on the store_readiness .storekit fix.)
    - name: tests_evals
      ship_critical: true
      grade: B
      evidence: >-
        UNCHANGED B. The suite grew to 1070 tests / 76 files (from 1029/75), coverage enforced and passing (stmts 92.41 /
        branch 83.73 / funcs 92.55 / lines 93.77, 60/60/50/60 hard-fail). Eval breadth is real (elevenlabs.eval.ts +
        atlascloud.eval.ts alongside detect/score, rubric unit-tested in normal CI) and the iOS export-to-file roundtrip
        (#378) executes the real exporter. Tests spot-checked as non-tautological (credit-store 133-pass batch, velocity
        Infinity guard). But the A-blocker is UNCHANGED: the paid-eval suite is ADVISORY, not enforced — live-eval.yml is NOT
        a required check (workflow_dispatch + weekly cron only), stays GREEN whether or not any real round-trip ran
        (::warning::+pass when keyless, :52-54; ElevenLabs/AtlasCloud steps skip via `if: env.X != ''`, :58/:66 — #289
        unresolved). AND the `ios` check running ExportRoundtripTests is explicitly NON-required (ci.yml:125 "Kept NON-required
        until reliably green"), so neither gates a merge.
      gap_to_a: >-
        Make the paid-eval suite enforceable (hard-fail when a live-capable provider's key is missing, or add a required
        readiness gate) so "eval exists but never actually executed" can't silently persist (#289); and promote `ios` to a
        required check so the executing iOS export roundtrip actually gates merges.
    - name: performance
      ship_critical: false
      grade: A
      evidence: >-
        Held A. #419 CLOSED prior residual (b): kinetic-text.ts:30-44 measureTextCached memoizes ctx.measureText().width
        keyed by (font+text), consumed in the per-frame caption render loop (wrapText :333, drawSpacedText :502) — the
        unmemoized per-word/per-char measure cost is gone. iOS thumbnail cache remains proper per-entry LRU
        (ThumbnailService.swift accessOrder + evict-coldest, no full-clear scrub-storm). Web caching world-class (asset-cache
        per-entry 24h TTL + LRU MAX_ENTRIES 50; DetectingStep SCORING_CONCURRENCY=4 + stagger + circuit breaker; MAX_FRAMES
        runaway caps). No new O(n²): frame-extractor single-pass subsampled; scene detection linear bounded by the 120-frame cap.
        Web build compiled successfully this run.
      gap_to_a: >-
        (To A+) ONE bounded residual remains (residual (a), open since 468dd02): NO Swift test asserting ThumbnailService
        eviction ORDER — `grep -rlin 'thumbnail|accessOrder|evict|maxCacheSize' Tests/` = 0. Add an LRU-eviction ordering test
        so the coldest-key-evicted invariant is locked against regression.
  top_gaps:
    - "store_readiness (C, ship-critical): NO archivable Xcode app target (Package.swift is .library-only — a SwiftPM package cannot produce a submittable IPA; CI has no -exportArchive) and missing 6.9-inch (1320×2868) App Store screenshots/preview — the single dimension keeping ship_gate_met=false. Also placeholder team/app IDs and the consumable credit-pack SKU absent from StoreKitConfiguration.storekit. UNCHANGED for FIVE cycles; only a doc (#426 APP_TARGET_SETUP.md) moved. Owner-only Mac work."
    - "functional_reality (B, ship-critical): the ACTUAL free-tier shipped export ALWAYS takes the watermark→AVVideoCompositionCoreAnimationTool overlay path (ExportView.swift:275 forces shouldWatermark=true for free users), which has ZERO executing coverage (only config assertions) and hangs on the CI simulator; and the export-COUNT quota is still client-side UserDefaults (ExportView/AppState, reset by SettingsView.swift:200 / reinstall). Both gaps unchanged."
    - "tests_evals (B, ship-critical): eval breadth (ElevenLabs/AtlasCloud) + iOS export roundtrip exist and ran green — but the paid-eval suite is ADVISORY, not enforced: live-eval.yml is not a required check and stays green when keyless (#289), and the `ios` check running ExportRoundtripTests is explicitly NON-required (ci.yml:125), so neither gates merges."
```

## How to read this

`overall: B` — a product that keeps **hardening within grade** (`security` #403 closed the XFF-spoof half of its
per-IP residual; `performance` #419 memoized the per-frame `measureText`; the web suite grew to **1070 tests** with
coverage at **92.41% stmts**) but is **still not ship-ready**. The ship gate stays **false** because three ship-critical
dimensions remain below the A bar — the same three, on the same root blockers.

**What moved this cycle.** `artifact_integrity` slipped **A+ → A** on a single, trivial, newly-introduced doc-vs-doc
numeric nit: **#410** (which landed after the last grade) corrected the store headline **"7-Pass" → "6-Pass"** to match
the 6-pass UI, while a historical narrative line (`REMAINING_STEPS.md:112`) still calls the "7-pass" language accurate.
Defensible (7 = backend stage count, 6 = UI-displayed passes) and a one-line fix, but a genuine finding where last cycle
had none — so A, not A+ (holding A+ over a fresh finding would be the inflation the rubric warns against). Everything else
held: `security` **A** (one in-memory-bucket residual remains), `correctness_reliability` **A** (credit atomicity still
mock-only; 133/133 tests pass), `business_case_strength` **A** (all numbers independently recomputed, reconcile), and
`design_taste` **A+** (emoji-as-UI grep = 0, real iconography, tokens mirrored) and `performance` **A** held with no
regression.

**Why the gate stays false.** `store_readiness` is still **C** — no archivable Xcode app target (a SwiftPM `.library`
cannot be submitted) and no 6.9-inch App Store screenshots; **open for five cycles** and the single hard blocker (only a
doc, #426, moved this window). `functional_reality` is **B** — the *actual* free-tier shipped export always takes the
watermark→Core-Animation overlay path, which has no executing coverage and hangs on the CI simulator, and the export-count
quota is still client-side/resettable. `tests_evals` is **B** — the evals exist and ran green against real APIs, but the
paid-eval suite is *advisory* (`live-eval` not required, stays green keyless, #289) and the `ios` check running the roundtrip
is explicitly non-required, so neither gates a merge. The factory should drive the ordered `top_gaps`, starting with the
`store_readiness` C.

Grades are backed by the mechanical signals above (web gate re-run green this run: 1070 tests, coverage enforced, 0 lint,
build ok; main CI green on `8b0b04b`) and per-dimension file/line evidence — graded by fresh, independent, adversarial
per-dimension subagents (none wrote the code), reconciled with independent auditor judgment. The one grade change
(`artifact_integrity` A+→A) was accepted, not overridden up, on a verified fresh finding. No grade exceeds its evidence; no
subagent letter was rubber-stamped.
