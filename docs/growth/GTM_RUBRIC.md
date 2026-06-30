# GTM RUBRIC — HighlightMagic

The grading standard the **independent GTM Auditor** uses to grade the GTM Factory's
revenue/go-to-market work A+ → F every cycle. The Auditor is a SEPARATE, adversarial party
(maker ≠ checker): it never does GTM work; it grades it and files the gaps. This rubric is the
GTM analog of the product `QUALITY_RUBRIC` — same bar, applied to revenue instead of code.

It is graded against the discipline in `GTM_STANDARD.md` (the operating contract) and the
GTM Factory's own outputs: `docs/growth/GROWTH_STATUS.md`, `docs/growth/GROWTH_MEMORY.md`,
`docs/BUSINESS_CASE.md`, `ROADMAP.md` / `VISION.md` (steers), `PENDING_OPS.md` (owner actions),
and the GTM assets under `docs/growth/` + `docs/`.

The Auditor writes the result to `docs/growth/GTM_SCORECARD.md` (the dashboard source of truth)
and logs each grade to `docs/growth/GTM_AUDIT_MEMORY.md`.

---

## Grade scale (per dimension)

| Grade | Meaning |
|---|---|
| **A+** | Exemplary — all signals green AND zero findings. |
| **A** | Ship-bar — world-class, only trivial nits. |
| **B** | Solid, but a real named gap exists (below ship bar). |
| **C** | Notable gaps. |
| **D** | Significant problems. |
| **F** | Broken or dishonest. A **fabricated metric**, a **gamed business case**, or a **speculative roadmap steer** is an automatic F. |

A grade may **NOT exceed the evidence**. Every grade cites concrete evidence (file/line/commit).
Below A → name the SPECIFIC actionable gap. A null/ungraded dimension is **NOT** a pass.

---

## Dimensions

`ship_critical` dimensions (marked **\***) are the honesty/integrity ones — they gate the ship.

### 1. METRIC INTEGRITY \*  *(ship-critical)*
Every metric in `GROWTH_STATUS` is **REAL + sourced from a connected source + verifiable**. No
fabricated, flattered, or unsourced numbers. A metric no connected source reported is `0`/`null`,
never invented. For HighlightMagic specifically: `engine_pct` must equal what `scripts/preflight.sh`
computes from the E6 anchor files on disk; `outreach.drafted_7d` must reconcile to actual Gmail
drafts; all funnel/pmf/acquisition metrics stay `0`/`null` while `channels_connected: []`.
**A single fabricated/unsourced metric caps this dimension at F.**

### 2. BUSINESS-CASE HONESTY \*  *(ship-critical)*
`docs/BUSINESS_CASE.md` reconciles to the **REAL billing/pricing config** (StoreKit
`pro.monthly` $14.99 / `pro.yearly` $149.99, web landing, ASO) + sourced inputs. No number
inflated/gamed to clear the $100K floor. The `BUSINESS_CASE_SUMMARY` YAML matches the body
(arr_year1 per scenario, floor_met_year1, time_to_floor). Floor math honest; the snapshot-share
subscriber model honestly discloses its optimism vs a cohort waterfall. A gamed number is an F.

### 3. EXPERIMENT VALIDITY
Falsifiable hypotheses (one metric, minimum sample size, stop rule), sufficient N / a stated
significance, no p-hacking or selecting on noise, correlation ≠ causation respected.
"Insufficient data" used honestly. Pre-launch with no traffic, `experiments: []` with designed
(not fabricated) tests staged is the honest posture.

### 4. ROADMAP-STEER JUSTIFICATION \*  *(ship-critical)*
Every `ROADMAP.md` / `VISION.md` / `docs/BUSINESS_CASE.md` steer the GTM Factory opened is backed
by **REAL data + significance + a CAUSAL revenue mechanism**. NO speculative or low-confidence
steer reached the roadmap. VISION steers cleared the higher adversarial-panel bar. Pre-PMF with
all-null data, the correct posture is **recommend-only** (write to GROWTH_STATUS, do not steer);
a speculative steer is an F. Absence of steers is NOT penalized.

### 5. SELF-VALIDATION HONESTY \*  *(ship-critical)*
The `GROWTH_STATUS` validation/sources block is accurate: declared sources match reality, no
claimed-but-unconnected channel, every unverifiable source marked `unavailable` + surfaced as a
`gtm-connect-<source>` owner action. **Fail closed** — a metric from an unverifiable source, or a
claimed-but-unconnected channel, is a release-blocking lie (the GTM equivalent of BUILDS≠WORKS).

### 6. PMF READ ACCURACY
The `pmf` block reflects real cohort data, not flattery. Pre-PMF the recommendation is
product/retention, not scaling acquisition ("no growth into a leaky bucket"). The `signal` read
is honest (never flattered): none | weak | emerging | strong.

### 7. COMPLIANCE
Outreach + public claims are TRUE, FTC/CAN-SPAM/GDPR-clean, ToS-respecting. No fake
accounts/engagement/reviews. Outreach is **draft-only** (never auto-sent), maker≠checker reviewed.
Free-tier watermark + the 50/user/day ceiling stated accurately; no "unlimited" + hard-cap
contradictions; no biometric/voice-clone claims without a confirmed compliant flow.

### 8. ARTIFACT FRESHNESS
GTM assets (positioning, pricing, copy, ASO, press kit) are consistent with the CURRENT product
and with each other. Pricing $14.99/$149.99 aligned across StoreKit / web / ASO / business case;
export-limit wording reconciled to the shipped control (50/user/day anti-abuse ceiling, Pro
unlimited-monthly).

---

## Ship gate

`ship_gate_met == true` **only when**:
- Every `ship_critical` dimension (metric integrity, business-case honesty, roadmap-steer
  justification, self-validation honesty) is **A or A+**, AND
- Every other dimension is **≥ B**, AND
- No dimension is null/ungraded.

When a ship-critical dimension is below A, its named `top_gap` is the GTM Factory's
highest-priority, value-bar-clearing work — to be fixed before new GTM work.

## Hard rules
- Graded by an **INDEPENDENT** party — never the GTM maker.
- A grade may NOT exceed the evidence; every grade cites file/line/commit.
- Default SKEPTICAL — NOT A+ unless genuinely earned.
- A fabricated/gamed GTM claim the Auditor lets pass is the Auditor's failure too.
- The Auditor writes ONLY `docs/growth/GTM_RUBRIC.md`, `docs/growth/GTM_SCORECARD.md`,
  `docs/growth/GTM_AUDIT_MEMORY.md` — never GTM assets, product code, or the business case.
