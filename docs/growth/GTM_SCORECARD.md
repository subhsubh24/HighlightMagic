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
  as_of: 2026-07-14
  graded_by: independent-gtm-auditor   # maker != checker; never the GTM maker
  overall: B
  ship_gate_met: false                 # REGRESSED true->false: artifact_freshness fell A->C (a false "7 kinetic caption styles" claim in a ready-to-record content asset), which is < B; all 4 ship_critical dims remain A/A+, but the ">= B on every other dimension" clause now fails
  dimensions:
    metric_integrity:                  # ship_critical
      grade: A
      evidence: >-
        No fabricated/unsourced metric found (independently re-verified). engine_pct: 100 is code-pinned —
        all 5 E6 anchor files exist on disk (web/src/app/api/waitlist/confirm/route.ts,
        web/src/lib/email/index.ts, web/src/lib/social/queue.ts, web/src/lib/growth/metrics.ts,
        docs/growth/CONNECT.md); preflight.sh:132-151 computes round(5/5*100)=100 and enforces
        engine_built==(engine_pct==100), matching GROWTH_STATUS.md:31-32. channels_connected: [] with
        every funnel/pmf/acquisition/email/content/outreach metric 0/null (lines 86-108, 256-283) — no
        non-zero metric lacks a connected source. outreach.drafted_7d: 0 is a correct decay: the Sam
        Gutelle/Tubefilter Gmail draft (2026-06-29) is 14 days old vs as_of 2026-07-13 (arithmetic
        verified), outside the trailing-7d window; no new draft invented. demand_signal cited_count
        values all reconcile to the citations actually listed (theme 1:3, theme 2:2, theme 3:3, theme
        4:2 — no inflation). GAP (nit, low): as_of 2026-07-13 is 1 day stale vs today (2026-07-14); the
        recurring freshness nit that keeps this off A+.
    business_case_honesty:             # ship_critical
      grade: A
      evidence: >-
        Recomputed independently; arithmetic reconciles and NO number is gamed. arr_year1.base 7740 =
        M12 43 Pro subs x $14.99 x 12 = $7,740 (BUSINESS_CASE.md:262); conservative 3060 (855 MAU x 2%
        x $14.99 x 12 = $3,058) and optimistic 33460 (3,715 MAU x 5% x $14.99 x 12 = $33,458) both
        reproduce from the S5 scenario assumptions and sit at/below the arithmetic — not inflated. Floor
        math honest: 556 x $14.99 x 12 = $100,013 ~= $100K; floor_met_year1: false correct (base year-1
        ARR $7,740 is ~13x below the floor). Pricing $14.99/$149.99 verified zero-drift against the REAL
        StoreKitConfiguration.storekit:25,47 (pro.monthly/pro.yearly) + web/src/lib/constants.ts:14. S10
        credit-pack books ZERO ARR (no invented attach-rate). DOWNGRADED A+ -> A (real internal
        inconsistency, not a gamed number, no auto-F): S9's "ARR acceleration estimate" prose
        (BUSINESS_CASE.md:428-429) still attributes the ~month-42 -> ~month-38 floor crossing to ANNUAL
        UPTAKE, directly contradicting the correctly-reconciled summary YAML + lines 202/316, which
        attribute the same 42->38 shift to the $9.99 -> $14.99 price move. Run 65 (#455, ec382a0)
        claimed to reconcile S9 but left this subsection stale. Changes no headline figure; floor_met
        stays honestly false.
    experiment_validity:
      grade: A
      evidence: >-
        Unchanged and honest. experiments[] holds one designed-not-run test,
        exp-landing-h1-benefit-vs-outcome (GROWTH_STATUS.md:263-273): status designed, result/lift null
        (no fabricated lift), blocker correctly cites the unbuilt E8 engine + zero traffic. Power calc
        re-verified: two-proportion z-test for 5%->7% at alpha=0.05/power=0.80 = ~2210/arm (4420 total),
        matching line 267. Baseline explicitly labeled an ASSUMPTION (5%), falsifiable with one metric +
        a stated min-N stop rule. No p-hacking possible at N=0.
    roadmap_steer_justification:       # ship_critical
      grade: A
      evidence: >-
        Zero speculative steers reached ROADMAP/VISION/BUSINESS_CASE. demand_signal.steers_opened: []
        (GROWTH_STATUS.md:204) with a verifiable note: 2 of 4 themes clear the S10 corroboration bar but
        map to the ALREADY-built core loop / flat pricing, so steering would be circular — textbook
        pre-PMF recommend-only. git log confirms NO GTM-opened commit touched ROADMAP.md/VISION.md since
        the last audit (the only Run-9 GTM commit, #474/62c14d0, touched docs/growth/* exclusively).
        Held at A (not A+): the demand corpus underpinning the no-steer call is still entirely
        aggregator/blog citations (primary Reddit/Trustpilot/App Store sources 403'd across Runs 5-7) —
        restraint is exemplary but the evidence base is second-hand by the agent's own disclosure.
    self_validation_honesty:           # ship_critical
      grade: A+
      evidence: >-
        The validation:/sources: block enumerates 9 external sources (GROWTH_STATUS.md:36-85), each
        status: unavailable with unavailable_count: 9 / available_count: 0, consistent with
        channels_connected: []. Every cited manifest line re-verified EXACT against
        web/src/lib/validation-manifest.ts: RESEND_API_KEY:77, KV_REST_API_URL:103, KV_REST_API_TOKEN:
        110, APP_STORE_ROOT_CA_PEM:119, INSTAGRAM_ACCESS_TOKEN:137, REDDIT_ACCESS_TOKEN:143,
        TIKTOK_ACCESS_TOKEN:149, X_API_BEARER_TOKEN:155, GROWTH_AGENT_SECRET:163 — zero inaccuracy. The
        honesty crux passes against the code: layout.tsx DOES conditionally render the nonce'd Plausible
        <script> gated to host highlightmagic.app, AND metrics.ts has zero Plausible references (grep) —
        getGrowthMetrics() reads only the KV waitlist store — so the disclosed gap (funnel visitor
        metrics stay null even after a Plausible account exists) is a truthful self-limitation, not a
        contradiction. Fail-closed; every unavailable source carries a gtm-connect-<source> owner action.
    pmf_read_accuracy:
      grade: A
      evidence: >-
        pmf block all null, signal: null (GROWTH_STATUS.md:102-108, "NEVER flattered"), phase pre_launch
        — accurate, not flattered. launch_readiness (lines 242-255): recommendation NOT_YET,
        demand_signal insufficient_data, next_owner_action steers to connecting free GTM sources +
        product readiness, NEVER scaling acquisition. The demand_signal overall_strength: emerging is
        properly firewalled — explicitly labeled a LEADING indicator NEVER PMF (line 109), with an
        explicit disconfirming block; not conflated with pmf.signal.
    compliance:
      grade: B
      evidence: >-
        Process rails remain strong: OUTREACH.md:3,5 states an unambiguous draft-only rail ("the agent
        never sends... no auto-send ever"); the one Sam Gutelle draft remains unsent. Demand research is
        read-only and did not circumvent gated APIs (GROWTH_STATUS.md:135 — Reddit API not circumvented;
        137 — 403'd primary pages not force-fetched); no fake reviews/engagement. The #474 music/SFX fix
        is complete (email-sequences.md:8 carries a "No music/SFX in v1" guardrail; no residual
        delivered-feature music claim survives in docs/growth). Watermark + 50/day fair-use ceiling
        stated accurately; no biometric/voice-clone claim. DOWNGRADED A -> B: the queued "7 kinetic
        caption styles" script (docs/content/post-batch-1.md:252,261) is an unsubstantiated advertising
        claim (only 4 of 7 styles animate) primed to air verbatim from a "Ready to record" asset. Live
        exposure today is low (nothing posted, app not live, all CTAs point to the waitlist), so this is
        a draft-stage defect, not a live violation — hence B — but the maker!=checker compliance layer
        is meant to catch exactly this before it reaches a ready-to-record asset, and it did not.
    artifact_freshness:
      grade: C
      evidence: >-
        A false product claim persists UNFIXED in a ready-to-record GTM asset. docs/content/post-batch-1.md
        still claims "7 kinetic caption styles" in two places — the on-screen end card (line 252) and the
        post caption (line 261) — but the product source of truth refutes it: Sources/Models/ViralEditConfig.swift
        defines 7 KineticCaptionStyle cases, yet KineticCaptionRenderer.swift:34-36 renders .flicker/.fade
        statically behind a TODO and `none` is static, so only 4 animate (pop, bounce, slide, typewriter) —
        exactly what the honest assets already state (press-kit.md:37,75; aso-package.md:71). The file is
        headed "Ready to record" with no draft/hold label, and this is precisely the item product-side
        commit #487 (542406c) said it "LEFT for the growth routine to fix" — the GTM Factory has since
        honesty-edited this same file twice (Runs 8/9) and not caught it. Compounding: the NEW
        DEMAND_VALIDATION_KIT.md:16 (written this run, #474) re-echoes "kinetic captions (7 styles)",
        perpetuating the ambiguous 7-kinetic framing on the very day the product side walked it back. What
        PASSED: pricing zero-drift ($14.99/$149.99 across BUSINESS_CASE/email-sequences/press-kit/aso/CONNECT;
        every $9.99 is a labeled reference/competitor row); the #474 music/SFX fix is complete; the
        demand-validation-demo.html is honestly labeled a prop ("content prop, not the real app... fake data",
        title + line 186). GAP: remove/rewrite the false "7 kinetic caption styles" count in post-batch-1.md
        (name the 4 animating styles, per #487's own fix) and de-ambiguate DEMAND_VALIDATION_KIT.md:16.
  top_gaps:                            # ordered by severity
    - dimension: artifact_freshness
      grade: C
      severity: high
      gap: >-
        docs/content/post-batch-1.md:252,261 ship a false "7 kinetic caption styles" claim in a "Ready to
        record" public content asset — only 4 of 7 KineticCaptionStyle options animate
        (KineticCaptionRenderer.swift:34-36; none/.flicker/.fade render statically). This is the exact
        overclaim product-side #487 (542406c) already fixed in ASO/press and explicitly HANDED to the growth
        routine, and it survived two prior GTM honesty passes (Runs 8/9) over this same file. The new
        DEMAND_VALIDATION_KIT.md:16 re-echoes "kinetic captions (7 styles)" this run. Fix: rewrite both
        post-batch-1.md lines to name the 4 genuinely-animating styles (pop/bounce/slide/typewriter), as
        #487 did, and de-ambiguate the KIT line. This is the ship-gate blocker (a non-critical dim below B).
    - dimension: compliance
      grade: B
      severity: medium
      gap: >-
        Same root cause as artifact_freshness: the "7 kinetic caption styles" script (post-batch-1.md:252,261)
        is a latent FTC-substantiation risk primed to air verbatim from a ready-to-record asset. Exposure is
        low today (nothing posted, app pre-launch, CTAs point to the waitlist), but the maker!=checker
        compliance review should have removed it before it reached ready-to-record status. Fixed by the same
        edit as the artifact_freshness gap.
    - dimension: business_case_honesty
      grade: A
      severity: low
      gap: >-
        docs/BUSINESS_CASE.md:428-429 (S9 "ARR acceleration estimate" prose) still attributes the ~month-42
        -> ~month-38 $100K-floor crossing to ANNUAL UPTAKE, contradicting the reconciled summary YAML +
        lines 202/316 which attribute the same shift to the $9.99 -> $14.99 price move. Run 65 (#455)
        reconciled the rest of S9 but left this subsection stale. Not a gamed number (changes no headline
        figure; floor_met stays honestly false) — an internal inconsistency to reconcile. Above the ship bar.
    - dimension: metric_integrity
      grade: A
      severity: low
      gap: >-
        GROWTH_STATUS as_of is 2026-07-13, 1 day stale vs today (2026-07-14). Stamp as_of every run. Not a
        fabrication — the recurring freshness nit that keeps the dimension off A+.
  notes: >-
    SHIP GATE REGRESSED true -> false. All 4 ship_critical dimensions still pass (metric_integrity A,
    business_case_honesty A, roadmap_steer A, self_validation_honesty A+) with no fabricated metric, no
    gamed number, and no speculative steer found. The regression is NOT an integrity failure — it is a
    single, real, unfixed honesty defect in a customer-facing content asset: a false "7 kinetic caption
    styles" count (only 4 of 7 animate) sitting in the ready-to-record docs/content/post-batch-1.md, plus a
    same-run re-echo in the new DEMAND_VALIDATION_KIT.md. Because artifact_freshness is a non-critical
    dimension now below B (C), the ">= B on every other dimension" clause fails and the gate closes even
    though every integrity dimension holds. business_case_honesty eased A+ -> A on a genuine (non-gaming) S9
    prose inconsistency; compliance eased A -> B as the FTC-facing face of the same post-batch-1 overclaim.
    Filed one gtm-quality issue (artifact_freshness C -> raise to A) covering the post-batch-1 + KIT overclaim
    with the compliance angle noted; the two low-severity A-grade nits (S9 prose; as_of freshness) are not
    filed to avoid noise.
```

## What changed since last grade (2026-07-10 → 2026-07-14)
- **Ship gate REGRESSED true → false.** New finding: a false **"7 kinetic caption styles"** claim persists in
  the ready-to-record `docs/content/post-batch-1.md:252,261` — only 4 of 7 styles animate
  (`KineticCaptionRenderer.swift:34-36`). This is the exact overclaim product-side #487 fixed and handed to
  the growth routine; it survived two prior GTM honesty passes and was re-echoed this run in the new
  `DEMAND_VALIDATION_KIT.md:16`. `artifact_freshness` **A → C**; because it is a non-critical dimension now
  below B, the gate closes despite all four ship-critical dimensions still passing.
- `compliance` **A → B**: the same queued overclaim is a latent FTC-substantiation risk in a ready-to-record
  public script (low live exposure — draft-only, app pre-launch — but the compliance layer should have caught it).
- `business_case_honesty` **A+ → A**: a genuine internal inconsistency — `BUSINESS_CASE.md:428-429` still
  attributes the month-42→38 floor crossing to annual uptake, contradicting the reconciled YAML/body which
  attribute it to the $14.99 price move. Not a gamed number; arithmetic and floor math all reconcile.
- Unchanged: `metric_integrity` A (as_of 1-day-stale nit recurs), `self_validation_honesty` A+ (all 9 manifest
  line numbers re-verified exact; Plausible code-half-done honestly disclosed), `roadmap_steer_justification` A
  (zero steers; no GTM-opened ROADMAP/VISION commit), `experiment_validity` A, `pmf_read_accuracy` A.
- The #474 music/SFX honesty fix (email-sequences.md) is **complete and verified** — no residual delivered-feature
  music claim survives in growth assets; the demand-validation demo is honestly labeled a fake-data prop.
