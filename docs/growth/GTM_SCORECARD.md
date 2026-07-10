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
  as_of: 2026-07-10
  graded_by: independent-gtm-auditor   # maker != checker; never the GTM maker
  overall: A
  ship_gate_met: true                  # all 4 ship_critical dims A/A+ (self_validation_honesty B->A+ via #208); all others >= B; none null
  dimensions:
    metric_integrity:                  # ship_critical
      grade: A
      evidence: >-
        No fabricated/unsourced metric found (re-verified this run). engine_pct: 100 pinned to code —
        all 5 E6 anchor files exist on disk (scripts/preflight.sh:132-138: waitlist/confirm route,
        lib/email/index.ts, lib/social/queue.ts, lib/growth/metrics.ts, CONNECT.md), and
        engine_built==(engine_pct==100) enforced (preflight.sh:149-150). channels_connected: []
        (GROWTH_STATUS.md:33) with every funnel/pmf/acquisition/email metric 0/null (lines 87-108,
        275-282) and validation available_count: 0 (line 85) — nothing requires a source it lacks.
        outreach.drafted_7d: 0 (line 257) is a CORRECT decay: the Sam Gutelle/Tubefilter Gmail draft
        (2026-06-29) is 11 days old, outside the 7d window — confirmed via Gmail list_drafts still
        unsent, zero replies; no new draft invented. demand_signal cited_count values reconcile to
        real cited review URLs, honestly labeled leading-indicator not PMF. GAP (nit): as_of
        2026-07-09 is 1 day stale vs today; the drafted_7d inline comment says "10 days" (should be 11).
    business_case_honesty:             # ship_critical
      grade: A+
      evidence: >-
        Recomputed independently. arr_year1.base 7740 = M12 MRR $645 x12 (BUSINESS_CASE.md:9,262);
        conservative 3060 / optimistic 33460 reproduce from the S5 scenario assumptions; floor math
        556 x $14.99 x 12 = ~$100,013 ~= $100K, floor_met_year1: false honest (line 13-14). Pricing
        $14.99/$149.99 verified against the REAL config: StoreKitConfiguration.storekit:25,37,47,59
        (pro.monthly P1M 14.99, pro.yearly P1Y 149.99), mirrored in SubscriptionProduct.swift,
        web/src/lib/constants.ts:14, landing page, ASO/press — zero drift. The §4 snapshot-share note
        (lines 239-255) openly discloses the 3%-of-MAU column is the OPTIMISTIC end vs a cohort
        waterfall (~24-31% higher). §10 books ZERO ARR for the shipped credit-pack backend (#237),
        as_of frozen 2026-06-27, because the iOS purchase UI isn't built and no honest attach-rate
        exists — the correct refusal to invent a floor-clearing number. The stale as_of is documented
        no-recompute-since (changelog line 474); restamping to fake freshness would be less honest.
    experiment_validity:
      grade: A
      evidence: >-
        experiments[] holds one designed-not-run test, exp-landing-h1-benefit-vs-outcome
        (GROWTH_STATUS.md:263-273): status designed, result/lift null (no fabricated lift), blocker
        correctly cites the unbuilt E8 engine + zero traffic. Power calc verified independently — a
        two-proportion z-test for p1=0.05 vs p2=0.07 at alpha=0.05/power=0.80 yields ~2210/arm (4420
        total), matching line 267 exactly. Baseline explicitly labeled an ASSUMPTION (5%), not a
        measured rate; hypothesis is falsifiable with one metric + a stated min-N stop rule. Honest
        pre-launch posture, no p-hacking possible at N=0.
    roadmap_steer_justification:       # ship_critical
      grade: A
      evidence: >-
        Zero speculative steers reached ROADMAP/VISION/BUSINESS_CASE. demand_signal.steers_opened: []
        (GROWTH_STATUS.md:204) with a verifiable note: 2 of 4 themes clear the S10 corroboration bar
        but map to the ALREADY-built core loop / flat pricing, so steering would be circular —
        textbook pre-PMF recommend-only. VISION.md now exists but git log -- VISION.md shows it was
        authored by the OWNER (Subh Mukherjee) via roadmap epic #374/#373, NOT a GTM demand-driven
        steer — no finding for this dimension. The gtm(Run 7) commit (#408, 9c45cfe) touched only
        PENDING_OPS/GROWTH_MEMORY/GROWTH_STATUS — restructured demand_signal to the S10 schema + fixed
        one stale metric, steered nothing. BUSINESS_CASE §2 demand addendum changed no modeled number.
        Held at A (not A+): the demand corpus underpinning the no-steer call is entirely aggregator/blog
        citations (primary Reddit/Trustpilot/App Store sources 403'd across Runs 5-7) — restraint is
        exemplary but the evidence base is second-hand by the agent's own disclosure.
    self_validation_honesty:           # ship_critical
      grade: A+
      evidence: >-
        RESOLVED since bootstrap (was B, the sole ship-gate blocker; issue #208 closed 2026-07-01).
        The structured validation:/sources: block now enumerates 9 external sources (GROWTH_STATUS.md:
        36-85), each status: unavailable with unavailable_count: 9 / available_count: 0 consistent
        with channels_connected: []. Every cited code line VERIFIED exact against
        web/src/lib/validation-manifest.ts: RESEND_API_KEY:77, KV_REST_API_URL:103, KV_REST_API_TOKEN:
        110, APP_STORE_ROOT_CA_PEM:119, INSTAGRAM:137, REDDIT:143, TIKTOK:149, X:155,
        GROWTH_AGENT_SECRET:163 — zero inaccuracy. Honesty crux passes: the in_app_analytics why (line
        42) discloses the code-half-done trap — layout.tsx renders the Plausible script but
        getGrowthMetrics() (metrics.ts) reads only the KV waitlist store (grep for "plausible" = no
        match), so funnel visitor metrics stay null even after the account exists. Owner actions use
        the gtm-connect-<source> naming per GTM_STANDARD S4, mirrored in PENDING_OPS.md. Fail-closed.
    pmf_read_accuracy:
      grade: A
      evidence: >-
        pmf block all null, signal: null (GROWTH_STATUS.md:102-108, "NEVER flattered"), phase
        pre_launch — accurate, not flattered. launch_readiness (lines 242-255): recommendation
        NOT_YET, demand_signal insufficient_data, next_owner_action steers to connecting free GTM
        sources + product readiness, NEVER scaling acquisition. The demand_signal overall_strength:
        emerging is properly firewalled — explicitly labeled "LEADING indicator, NEVER PMF" (line 109),
        sourced from public reviews, with an explicit disconfirming block; not conflated with pmf.signal.
    compliance:
      grade: A
      evidence: >-
        Outreach draft-only, hard-railed (OUTREACH.md:5 rail 1 "the agent never sends... no auto-send
        ever"); the one Sam Gutelle draft remains unsent. Recent honesty commits REMOVE overclaims
        (diffs read): #421 (33987cd) qualifies "unlimited monthly exports" with the 50/day fair-use
        ceiling; #410 (d3069c0) corrects an App Store screenshot pass-count overclaim (7->6); #415
        qualifies bare "unlimited". press-kit.md states the no-monthly-quota + 50/day ceiling
        accurately; no surviving voice-clone/biometric claim. demand research MINED public reviews
        read-only and did NOT post fake reviews/engagement (Reddit API explicitly not circumvented,
        GROWTH_STATUS.md:135). All public claims TRUE, FTC/CAN-SPAM-aware.
    artifact_freshness:
      grade: A
      evidence: >-
        Pricing $14.99/$149.99 consistent across BUSINESS_CASE, email-sequences, CONNECT.md, ASO,
        press-kit, and the scorecards; the only $9.99 occurrences are correctly labeled "reference
        only — NOT the live price" or a competitor row. The bootstrap-flagged aso-package.md nit is
        FIXED — the paywall table header now reads "No monthly export cap" / "Unlimited monthly
        exports" with the 50/day qualifier present. Export-limit wording reconciled across current
        customer-facing assets (terms, support post-#421, landing "Unlimited monthly exports",
        ExportStep "no monthly cap"). New assets (STORE_GROWTH_PLAYBOOK, ONBOARDING_CONVERSION_PLAYBOOK,
        brand-kit) introduce no pricing/claim drift. Minor residual: in-app headline "Go unlimited."
        (ExportStep.tsx) is a bare word, immediately qualified by adjacent "no monthly cap" copy.
  top_gaps:                            # ordered by severity; ship-gate is MET, so all are low
    - dimension: metric_integrity
      grade: A
      severity: low
      gap: >-
        GROWTH_STATUS as_of is 2026-07-09, 1 day stale vs today (2026-07-10); the drafted_7d inline
        comment computes the draft age as "10 days" off the stale as_of rather than today's 11. Stamp
        as_of every run. Not a fabrication — a freshness nit that keeps the dimension off A+.
    - dimension: roadmap_steer_justification
      grade: A
      severity: low
      gap: >-
        The demand_signal corpus is entirely aggregator/blog citations — primary sources
        (Reddit/Trustpilot/App Store review pages) returned HTTP 403 to WebFetch across Runs 5-7.
        Restraint (zero steers) is correct, but strengthen the evidence base with primary-source quotes
        (e.g. App Store RSS review feeds) BEFORE any future steer is built on it. Already self-tracked
        in GROWTH_STATUS next_actions.
    - dimension: artifact_freshness
      grade: A
      severity: low
      gap: >-
        In-app ExportStep headline "Go unlimited." is a bare superlative; it is qualified by adjacent
        "no monthly cap" copy so not customer-deceptive, but tightening it to match the qualified
        wording used everywhere else would close the last residual.
  notes: >-
    SHIP GATE NOW MET. The bootstrap's single blocker — self_validation_honesty B (no structured
    validation/sources block) — was closed by issue #208 (Run 4, 2026-07-01) and independently
    re-grades to A+: all 9 cited manifest line numbers are exact, fail-closed, with an honest
    disclosure of the Plausible code-half-done trap. business_case_honesty rose A->A+ on full pricing
    reconciliation to the real StoreKit config + zero-ARR credit-pack + disclosed snapshot optimism.
    roadmap_steer eased A+->A only as adversarial caution (its no-steer call rests on a second-hand
    demand corpus), still a clear pass. No fabricated metric, no gamed number, no speculative steer
    found. All remaining gaps are low-severity nits already tracked by the GTM Factory; no blocking
    gtm-quality issue is warranted this run (issue #208 already closed).
```

## What changed since last grade
- **Ship gate flipped false → true.** The sole 2026-06-30 blocker, `self_validation_honesty` (B → **A+**),
  was resolved by issue #208 (Run 4): the mandated structured `validation:`/`sources:` block now exists
  in GROWTH_STATUS with 9 sources, every cited manifest line number verified exact, fail-closed.
- `business_case_honesty` **A → A+**: full pricing reconciliation to the real StoreKit config file,
  zero-ARR credit-pack lever (#237), disclosed snapshot-share optimism.
- `roadmap_steer_justification` **A+ → A**: VISION.md now exists but is owner-authored (epic #374), not a
  GTM steer; still zero speculative steers — eased to A only as adversarial caution on the second-hand
  demand corpus.
- All other dimensions unchanged at A. The bootstrap's low nits (as_of freshness; aso-package "Unlimited"
  header) — the aso nit is **fixed**; the as_of freshness nit recurs.
