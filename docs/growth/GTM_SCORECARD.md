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
  as_of: 2026-06-30
  graded_by: independent-gtm-auditor   # maker != checker; never the GTM maker
  overall: A
  ship_gate_met: false                 # self_validation_honesty (ship-critical) is B, below the A/A+ bar
  dimensions:
    metric_integrity:                  # ship_critical
      grade: A
      evidence: >-
        All demand metrics 0/null while channels_connected: [] (GROWTH_STATUS.md:33-75) — honest.
        engine_pct: 100 verified against scripts/preflight.sh (5/5 E6 anchor files exist on disk:
        waitlist/confirm route, lib/email, lib/social/queue, lib/growth/metrics, CONNECT.md).
        outreach.drafted_7d: 1 reconciles to a REAL Gmail draft (to sam@tubefilter.com, 2026-06-29).
        No fabricated/unsourced metric found. Nit: as_of 2026-06-29 is 1 day stale (today 2026-06-30).
    business_case_honesty:             # ship_critical
      grade: A
      evidence: >-
        BUSINESS_CASE_SUMMARY YAML recomputes to the body: arr_year1.base 7740 = M12 MRR $645 x12;
        conservative 3060 and optimistic 33460 reproduce from the S5 scenario assumptions; floor math
        556 x $14.99 x 12 = ~$100K; floor_met_year1: false honest. Pricing $14.99/$149.99 matches
        StoreKit (SubscriptionProduct.swift:18-21), web landing, and ASO exactly. The PR #205
        snapshot-3%-of-MAU note openly discloses the share model is optimistic vs a cohort waterfall
        (~24-31% higher) rather than hiding it. No number gamed to clear the floor.
    experiment_validity:
      grade: A
      evidence: >-
        experiments: [] (GROWTH_STATUS.md:65) — honest insufficient-data posture with no traffic and
        no connected source; no fabricated lift, no p-hacking possible at N=0. H1 landing-copy variants
        staged as a DESIGNED (not run) test in next_actions. Correct pre-launch handling.
    roadmap_steer_justification:       # ship_critical
      grade: A+
      evidence: >-
        VISION.md absent (no VISION steers possible). With all growth metrics 0/null, the factory
        correctly stayed recommend-only — zero speculative steers reached ROADMAP/BUSINESS_CASE.
        Every GTM-adjacent edit is a verifiable consistency/honesty/explanatory fix: #205 (explain
        3%-of-MAU model, no recompute), #197 (fix stale 50/month->50/day refs), #159 (unlimited->
        unlimited MONTHLY), #152 (checkbox tick + arithmetic fix). Exemplary anti-gaming discipline.
    self_validation_honesty:           # ship_critical
      grade: B
      evidence: >-
        Honest by every substantive test: channels_connected: [], all metrics 0/null, nothing
        fabricated, no claimed-but-unconnected channel; gaps surfaced as urgent owner actions
        (PENDING_OPS connect-channels + spend-caps) with a concrete CONNECT.md runbook (fails closed).
        GAP: no structured validation:/sources: block in the GROWTH_STATUS YAML enumerating each
        external source (analytics, billing/StoreKit, Resend/email, Vercel KV, social) with an
        explicit available/unavailable status, as GTM_STANDARD.md:76-89 (S4 + S5 expected keys)
        requires. Honesty is carried informally by channels_connected + owner_blockers instead.
    pmf_read_accuracy:
      grade: A
      evidence: >-
        pmf block all null, signal: null, phase: pre_launch (GROWTH_STATUS.md:52-58) — accurate, not
        flattered. The standing recommendation is product/retention/prepare, never scaling
        acquisition; BUSINESS_CASE explicitly states "no growth into a leaky bucket." Correct pre-PMF read.
    compliance:
      grade: A
      evidence: >-
        Outreach is draft-only (OUTREACH.md hard rails; Gmail create_draft, never auto-send),
        maker!=checker reviewed; the Sam Gutelle draft was flagged for CAN-SPAM (physical address,
        opt-out) + personalization before send. press-kit.md had 8 honesty/FTC fixes (removed
        "unlimited"+cap contradiction, "full feature access" falsehood, voice-clone biometric claim,
        "every frame" exaggeration). No fake accounts/engagement/reviews. All public claims TRUE.
    artifact_freshness:
      grade: A
      evidence: >-
        Pricing $14.99/$149.99 consistent across StoreKit, web landing, ASO, and BUSINESS_CASE.
        Export-limit wording reconciled to the shipped control (50/user/day anti-abuse ceiling, Pro
        unlimited-monthly); stale "50/month cap" refs fixed in #197. Nit: aso-package.md:120 table
        header says "Unlimited exports" without the per-day qualifier (the row context clarifies).
  top_gaps:                            # ordered by severity; ship-critical-below-A first
    - dimension: self_validation_honesty
      grade: B
      severity: high
      gap: >-
        Add a structured validation:/sources: block to the GROWTH_STATUS YAML enumerating each
        external source (in_app_analytics, billing/StoreKit, email/Resend, datastore/Vercel KV,
        each social channel) with an explicit available|unavailable status, and rename the connect
        owner actions to the gtm-connect-<source> convention per GTM_STANDARD.md S4. Nothing is
        fabricated today; this is the missing machine-readable contract that caps the ship gate.
    - dimension: metric_integrity
      grade: A
      severity: low
      gap: >-
        GROWTH_STATUS as_of is 2026-06-29, one day stale vs today (2026-06-30). Stamp as_of every run.
    - dimension: artifact_freshness
      grade: A
      severity: low
      gap: >-
        aso-package.md:120 paywall-screen table header says "Unlimited exports" without the
        "50/day fair-use ceiling" qualifier used elsewhere (line 85); tighten for consistency.
  notes: >-
    Bootstrap run of the independent GTM Auditor. 7 of 8 dimensions at A/A+; the GTM Factory's
    honesty discipline is genuinely strong (real metrics, reconciled business case, zero speculative
    steers, draft-only compliant outreach). The single ship gate blocker is a STRUCTURAL gap, not a
    fabrication: the GROWTH_STATUS YAML lacks the GTM_STANDARD-mandated validation/sources block.
```

## What changed since last grade
- First grade — Auditor bootstrap (`docs/growth/GTM_RUBRIC.md` and this scorecard created this run).
