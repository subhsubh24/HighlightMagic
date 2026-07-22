# GTM SCORECARD — HighlightMagic

The independent **GTM Auditor's** machine-readable grade of the GTM Factory's revenue/go-to-market
work, graded against `docs/growth/GTM_RUBRIC.md`. The factory dashboard reads the fenced
`GTM_SCORECARD` block below (alongside the product `QUALITY_SCORECARD`), so the two factories are
held to the same bar. **The GTM Factory CONSUMES this as a data signal — it must NEVER write this
file** (maker ≠ checker). Only the Auditor writes it.

How to read it: `ship_gate_met` is true only when every `ship_critical` dimension is A/A+ and all
others ≥ B. When a ship-critical dimension is below A, the named `top_gap` is the factory's
highest-priority work. Every grade is evidence-backed (file/line/commit). A null grade is NOT a pass.

```yaml
GTM_SCORECARD:
  project: HighlightMagic
  as_of: 2026-07-22
  graded_by: independent-gtm-auditor   # maker != checker; never the GTM maker
  overall: A
  ship_gate_met: true                  # RECOVERED false->true: the ship-gate blocker (artifact_freshness C, the false "7 kinetic caption styles" claim) is FIXED and independently reconfirmed against Swift source; artifact_freshness C->A and compliance B->A. All 4 ship_critical dims A/A+, every non-critical dim >= B (all A), none null
  dimensions:
    metric_integrity:                  # ship_critical
      grade: A
      evidence: >-
        No fabricated/unsourced metric found (independently re-verified). engine_pct: 100 is code-pinned —
        all 5 E6 anchor files exist on disk (web/src/app/api/waitlist/confirm/route.ts,
        web/src/lib/email/index.ts, web/src/lib/social/queue.ts, web/src/lib/growth/metrics.ts,
        docs/growth/CONNECT.md); preflight.sh:132-150 computes round(5/5*100)=100 and enforces
        engine_built==(engine_pct==100), matching GROWTH_STATUS.md:31. channels_connected: [] with
        every funnel/pmf/acquisition/email/content/outreach metric 0/null — no non-zero metric lacks a
        connected source. outreach.drafted_7d: 0 is a correct decay: the Sam Gutelle/Tubefilter Gmail
        draft (2026-06-29, live-checked to sam@tubefilter.com, still unsent with placeholders unfilled)
        is 20 days old vs as_of 2026-07-19, outside the trailing-7d window; no new draft invented.
        demand_signal cited_count values all reconcile to the citations actually listed (theme 1:3,
        theme 2:2, theme 3:8 [1 main + 2 aggregator + 5 primary_examples], theme 4:2 — no inflation).
        GAP (nit, low): as_of 2026-07-19 is 3 days stale vs today (2026-07-22) — the recurring freshness
        nit that keeps this off A+ (A+ requires zero findings). Not a fabrication; the doc itself flags a
        stale as_of as a signal.
    business_case_honesty:             # ship_critical
      grade: A+
      evidence: >-
        Recomputed independently; arithmetic reconciles and NO number is gamed. arr_year1.base 7740 =
        M12 monthly revenue $645 (BUSINESS_CASE.md:262) x 12 = $7,740; conservative 3060 (855 MAU x 2%
        x $14.99 x 12 = ~$3,058) and optimistic 33460 (3,715 MAU x 5% x $14.99 x 12 = ~$33,458) both
        reproduce from the S5 scenario assumptions and sit at/below the arithmetic — not inflated. Floor
        math honest: ~556 x $14.99 x 12 = $99,978 ~= $100K; floor_met_year1: false correct (base year-1
        ARR $7,740 far below the floor). Pricing $14.99/$149.99 verified zero-drift against the REAL
        StoreKitConfiguration.storekit:25,47 (pro.monthly/pro.yearly) + web/src/lib/constants.ts:14. S10
        credit-pack books ZERO ARR (explicit anti-gaming guard, BUSINESS_CASE.md:468-476). UPGRADED A ->
        A+: the sole prior gap is FIXED — S9's "ARR acceleration estimate" prose (BUSINESS_CASE.md:427-433)
        now attributes the ~month-42 -> ~month-38 floor crossing "entirely to the $9.99 -> $14.99 price
        move... and is not re-counted here," reconciling cleanly with the summary YAML annual_tier_lever
        and lines 316. Run 72 changelog (BUSINESS_CASE.md:478) documents the reconciliation. Zero findings.
    experiment_validity:
      grade: A
      evidence: >-
        Unchanged and honest. experiments[] holds one designed-not-run test,
        exp-landing-h1-benefit-vs-outcome (GROWTH_STATUS.md:296-301): status designed, result/lift null
        (no fabricated lift), blocker correctly cites the unbuilt E8 engine + zero traffic. Power calc:
        two-proportion z-test for 5%->7% at alpha=0.05/power=0.80 = ~2210/arm (4420 total), matching
        line 300. Baseline explicitly labeled an ASSUMPTION (5%), falsifiable with one metric + a stated
        min-N stop rule. No p-hacking possible at N=0.
    roadmap_steer_justification:       # ship_critical
      grade: A+
      evidence: >-
        Zero speculative steers reached ROADMAP/VISION/BUSINESS_CASE. demand_signal.steers_opened: []
        (GROWTH_STATUS.md:233) with a verifiable note: 2 of 4 themes clear the S10 corroboration bar but
        map to the ALREADY-built core loop / flat pricing, so steering would be circular — textbook
        pre-PMF recommend-only. git log + git show --stat confirm the two GTM commits since last audit
        (#537/b0a738f Run 11, #561/e2db587 Run 12) touched only PENDING_OPS.md + docs/growth/* — NO
        write to ROADMAP.md/VISION.md; "No BUSINESS_CASE number changes" (line 256). UPGRADED A -> A+:
        the sole prior "held at A" reason — the second-hand/aggregator corpus — is now RESOLVED. Runs
        11/12 added PRIMARY, ID-verified App Store RSS review citations (GROWTH_STATUS.md:196-211); an
        adversarial grader independently confirmed via the iTunes lookup API that every cited app ID
        resolves to exactly the claimed competitor (id6743615403->OpusClip, id6748490660->Vizard,
        id1638105930->Eklipse, id1500855883->CapCut). Restraint stayed exemplary against the stronger
        corpus (the tempting single-source Vizard pattern was recorded as NOT clearing the >=2-source
        auto-steer bar, not forced into a direction). Zero findings.
    self_validation_honesty:           # ship_critical
      grade: A+
      evidence: >-
        The validation:/sources: block enumerates 9 external sources, each status: unavailable with
        unavailable_count: 9 / available_count: 0, consistent with channels_connected: []. Every cited
        manifest line re-verified EXACT against web/src/lib/validation-manifest.ts: RESEND_API_KEY:77,
        KV_REST_API_URL:103, KV_REST_API_TOKEN:110, APP_STORE_ROOT_CA_PEM:119, INSTAGRAM_ACCESS_TOKEN:137,
        REDDIT_ACCESS_TOKEN:143, TIKTOK_ACCESS_TOKEN:149, X_API_BEARER_TOKEN:155, GROWTH_AGENT_SECRET:163 —
        zero inaccuracy. The honesty crux passes against the code: layout.tsx:52-66 conditionally renders
        the nonce'd Plausible <script> gated to host highlightmagic.app, AND metrics.ts has zero Plausible
        references (grep) — getGrowthMetrics() reads only the KV waitlist store — so funnel visitor metrics
        stay null (a truthful self-limitation, not a contradiction). NEW this cycle: the App Store RSS feed
        (itunes.apple.com/us/rss/customerreviews) appears only under demand_signal.sources_covered as a
        public evidence source, never dressed up as a connected channel in validation.sources — honest, no
        phantom gtm-connect action. Fail-closed; every unavailable source carries a gtm-connect-<source> action.
    pmf_read_accuracy:
      grade: A
      evidence: >-
        pmf block all null, signal: null (GROWTH_STATUS.md:8-14, "NEVER flattered"), phase pre_launch —
        accurate, not flattered. launch_readiness: recommendation NOT_YET, demand_signal insufficient_data,
        next_owner_action steers to connecting free GTM sources + product readiness, NEVER scaling
        acquisition ("both launch gates unmet"). demand_signal overall_strength: emerging is properly
        firewalled — explicitly a LEADING indicator NEVER PMF, with an explicit disconfirming block; not
        conflated with pmf.signal.
    compliance:
      grade: A
      evidence: >-
        UPGRADED B -> A: the FTC-substantiation risk that drove the prior B is RESOLVED — no residual
        "7 kinetic styles" or music/SFX overclaim survives in any public/ready-to-record asset (grep
        clean; the only music references describe the AI reading source-audio energy, not the app adding
        audio). Outreach rail is genuinely draft-only: OUTREACH.md:5 "DRAFT ONLY — the agent never sends...
        no auto-send ever" + CAN-SPAM/GDPR opt-out, no scraped lists, waitlist-only links. Demand research
        did not circumvent gated APIs (GROWTH_STATUS.md:145 Reddit API not used; 147 403'd pages not
        force-fetched); the new Run 11/12 review-feed technique is legitimate — Apple's UNAUTHENTICATED
        PUBLIC itunes.apple.com/us/rss/customerreviews endpoint, explicitly contrasted with the still-403'd
        apps.apple.com listing page, raw-JSON-verified before citing. No fake reviews/engagement. Watermark
        + 50/user/day fair-use ceiling stated accurately (press-kit.md:22-23, aso-package.md:80-83,
        BUSINESS_CASE.md:78,221) — no bare "unlimited", no biometric/voice-clone claim.
    artifact_freshness:
      grade: A
      evidence: >-
        UPGRADED C -> A: the prior regression is FIXED and independently reconfirmed against Swift source.
        docs/content/post-batch-1.md:252 now reads "4 animated caption styles. All automatic." and :261
        "4 animated caption styles — pop, bounce, slide, typewriter — auto-applied" — naming exactly the
        four that animate. A grep for "7 kinetic|7 styles|7 animated|seven" across docs/ returns ZERO hits
        in any ready-to-record/public asset; the only remaining "7 kinetic" strings live in self-referential
        audit/memory files describing the historical defect. DEMAND_VALIDATION_KIT.md:16 de-ambiguated to
        "kinetic captions (4 animated styles)". Matches the source of truth: ViralEditConfig.swift:39-46
        defines 7 KineticCaptionStyle cases, but KineticCaptionRenderer.swift:34-36 renders .flicker/.fade
        via addStaticCaption behind a // TODO and .none is static — only 4 animate. Pricing zero-drift
        $14.99/$149.99 across press-kit/aso/email-sequences/CONNECT/BUSINESS_CASE; every $9.99 is a labeled
        reference/competitor row. Not A+ only because the current cleanliness required two passes to reach —
        the current artifact state is fully consistent.
  top_gaps:                            # ordered by severity
    - dimension: metric_integrity
      grade: A
      severity: low
      gap: >-
        GROWTH_STATUS as_of is 2026-07-19, 3 days stale vs today (2026-07-22). Stamp as_of every run. Not
        a fabrication — the recurring freshness nit that keeps the dimension off A+. Above the ship bar; not
        filed as an issue (filing A-grade trivia is noise).
  notes: >-
    SHIP GATE RECOVERED false -> true. The prior ship-gate blocker — the false "7 kinetic caption styles"
    claim in the ready-to-record docs/content/post-batch-1.md (only 4 of 7 KineticCaptionStyle cases animate)
    — is FIXED and independently reconfirmed against the Swift source: post-batch-1.md:252,261 now name the 4
    animating styles (pop/bounce/slide/typewriter) and DEMAND_VALIDATION_KIT.md:16 is de-ambiguated to
    "4 animated styles". artifact_freshness C -> A and compliance B -> A on that same fix. Two dimensions
    also earned genuine upgrades: business_case_honesty A -> A+ (the S9 double-attribution prose is
    reconciled — the month-42->38 floor crossing is now attributed entirely to the $14.99 price move, Run 72,
    BUSINESS_CASE.md:427-433), and roadmap_steer_justification A -> A+ (the prior "held at A" second-hand-corpus
    reason is resolved — Runs 11/12 added primary, ID-verified App Store RSS review citations, every app ID
    independently confirmed, while restraint stayed exemplary at zero steers). All 4 ship_critical dimensions
    A/A+ (metric_integrity A, business_case_honesty A+, roadmap_steer A+, self_validation_honesty A+); every
    non-critical dimension >= B (all A); none null -> gate MET. metric_integrity holds at A (not A+) on the
    recurring as_of freshness nit (now 3 days). No fabricated metric, no gamed number, no speculative steer.
    Closed issue #492 (the 7-kinetic gap) as completed after verifying the fix. NO new gtm-quality issue filed
    this run — the only remaining gap is the low-severity as_of nit (filing A-grade trivia is noise).
```

## What changed since last grade (2026-07-14 → 2026-07-22)
- **Ship gate RECOVERED false → true.** The prior blocker is FIXED: `docs/content/post-batch-1.md:252,261` now
  read **"4 animated caption styles — pop, bounce, slide, typewriter"** and `DEMAND_VALIDATION_KIT.md:16` is
  de-ambiguated to **"4 animated styles"** — verified against the Swift source (`KineticCaptionRenderer.swift:34-36`
  animates only those 4; a grep for "7 kinetic/7 styles/seven" is clean across all public/ready-to-record assets).
  `artifact_freshness` **C → A**.
- `compliance` **B → A**: the FTC-substantiation risk from that same overclaim is resolved; the new Run 11/12
  App Store RSS review technique is a legitimate unauthenticated PUBLIC endpoint (not a ToS circumvention of the
  still-403'd `apps.apple.com` listing page); draft-only outreach rail intact.
- `business_case_honesty` **A → A+**: the S9 double-attribution prose is reconciled — `BUSINESS_CASE.md:427-433`
  now attributes the month-42→38 floor crossing **entirely to the $9.99 → $14.99 price move** ("not re-counted
  here"), matching the summary YAML (Run 72 fix). No headline figure changed; floor math still honestly `false`.
- `roadmap_steer_justification` **A → A+**: the sole prior "held at A" reason — the second-hand/aggregator corpus
  — is resolved. Runs 11/12 (#537, #561) added **primary, ID-verified App Store RSS review citations**; every
  cited app ID was independently confirmed to resolve to the claimed competitor. Restraint stayed exemplary:
  `steers_opened: []`, no GTM commit touched `ROADMAP.md`/`VISION.md`.
- Unchanged: `metric_integrity` **A** (as_of now 3-day-stale nit recurs — the only remaining gap, low severity,
  not filed), `self_validation_honesty` **A+** (all 9 manifest line numbers re-verified exact; Plausible
  code-half-done honestly disclosed; RSS honestly kept out of `validation.sources`), `experiment_validity` **A**,
  `pmf_read_accuracy` **A** (NOT_YET, never scale-acquisition).
- Issue **#492** (the 7-kinetic-styles gap) is closed-completed after the fix was independently reconfirmed. No
  new `gtm-quality` issue filed — the only open gap is the low-severity `as_of` freshness nit.
