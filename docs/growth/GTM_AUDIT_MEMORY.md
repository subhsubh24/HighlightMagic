# GTM Audit Memory — HighlightMagic

Dated log of the independent **GTM Auditor's** grades — what was graded, the letter, the evidence,
and what changed vs the prior grade. **Read FIRST each run; diff against the last grade.** The
Auditor writes only this file, `GTM_RUBRIC.md`, and `GTM_SCORECARD.md` — it never does GTM work.

---

## 2026-06-30 — Audit Run 1 (Auditor bootstrap)

### State found
- `docs/growth/GTM_RUBRIC.md`, `docs/growth/GTM_SCORECARD.md`, `docs/growth/GTM_AUDIT_MEMORY.md`:
  did NOT exist — created this run from the rubric standard, adapted to HighlightMagic.
- GTM Factory state: phase pre_launch, engine_built true (engine_pct 100), channels_connected [],
  all funnel/pmf/acquisition metrics 0/null. VISION.md absent. Last GROWTH_STATUS as_of 2026-06-29.

### Grades (overall A; ship_gate_met FALSE)
| Dimension | Grade | Note |
|---|---|---|
| metric_integrity \* | A | engine_pct pinned to 5 real anchor files; drafted_7d:1 = real Gmail draft; all demand metrics 0/null. Nit: 1-day-stale as_of. |
| business_case_honesty \* | A | YAML recomputes to body; pricing matches StoreKit/web/ASO; PR #205 note discloses share-model optimism. |
| experiment_validity | A | experiments:[] honest at N=0; H1 variants staged as designed test. |
| roadmap_steer_justification \* | A+ | Zero speculative steers; every edit a consistency/honesty fix; VISION absent. |
| self_validation_honesty \* | B | **Ship gate blocker.** Honest + fails closed, but no structured validation:/sources: block per GTM_STANDARD §4. |
| pmf_read_accuracy | A | pmf null, signal null, pre-PMF; recommends product/retention not acquisition. |
| compliance | A | Outreach draft-only + maker≠checker; press-kit 8 honesty/FTC fixes. |
| artifact_freshness | A | Pricing aligned everywhere; export-limit wording reconciled. Nit: ASO line 120 header. |

### Method
Spawned 4 fresh, independent, adversarial grader subagents (each told to REFUTE) for the
ship-critical dimensions (metric integrity, business-case honesty, roadmap-steer, self-validation);
one independently cross-checked the live Gmail draft and the preflight anchor files. The Auditor
verified pricing config (StoreKit/web/ASO), the BUSINESS_CASE YAML↔body arithmetic, and the four
non-critical dimensions directly.

### Ship gate
**Not met.** `self_validation_honesty` is a ship-critical dimension at B (below the A/A+ bar). All
other ship-critical dimensions are A/A+ and every non-critical dimension is A — the only blocker is
the single structural gap.

### Top gap filed (for the GTM Factory to fix)
1. **self_validation_honesty B → A:** add a structured `validation:`/`sources:` block to the
   GROWTH_STATUS YAML enumerating each external source with `available|unavailable` status, and
   adopt the `gtm-connect-<source>` owner-action naming per GTM_STANDARD §4. Filed as a
   `gtm-quality:` GitHub issue. Nothing is fabricated today — this is the missing machine-readable
   contract, not a dishonesty finding.

### Read for next run
- This is the FIRST grade — no prior to diff against. Next run: diff every dimension vs this table;
  if `self_validation_honesty` is still B, the validation-block gap was not addressed — keep the
  issue open and re-surface it as the top gap.
- Watch `as_of` freshness on GROWTH_STATUS (was 1 day stale this run).
- The GTM Factory's honesty discipline is strong; default skeptical but the evidence supported the
  A-range grades. Do NOT inflate; re-verify the Gmail draft + preflight anchors + pricing each run.

---

## 2026-07-10 — Audit Run 2 (first re-grade)

### State found (diff vs bootstrap 2026-06-30)
- GTM_SCORECARD had NEVER been re-graded since bootstrap (as_of stuck at 2026-06-30 across GTM Factory
  Runs 4–7 — the Factory correctly flagged this as a stale-audit signal it couldn't fix itself). This
  run clears it.
- The bootstrap's sole ship-gate blocker was **closed**: issue #208 (self_validation_honesty B) —
  the GTM Factory added the mandated structured `validation:`/`sources:` block at Run 4 (2026-07-01).
  #208 is closed-completed. Independently verified accurate this run.
- New since bootstrap: VISION.md now exists (owner-authored via roadmap epic #374, NOT a GTM steer);
  a `demand_signal` (GTM_STANDARD S10) block; playbooks (STORE_GROWTH, ONBOARDING_CONVERSION);
  export-credit-pack backend (#237, zero ARR booked); several honesty commits (#415/#421/#410).

### Grades (overall A; **ship_gate_met TRUE** — flipped from false)
| Dimension | Grade | Δ vs bootstrap | Note |
|---|---|---|---|
| metric_integrity \* | A | = | No fabrication; engine_pct 100 = 5/5 real anchors; drafted_7d:0 an honest decay (draft 11d old, Gmail-confirmed unsent). Nit: as_of 1d stale. |
| business_case_honesty \* | A+ | ↑ (A) | Arithmetic recomputed; pricing reconciles to real StoreKit config file; zero-ARR credit pack; disclosed snapshot optimism. |
| experiment_validity | A | = | Power calc 2210/arm verified exact; result null (no fabricated lift); baseline labeled an assumption. |
| roadmap_steer_justification \* | A | ↓ (A+) | Zero speculative steers; VISION owner-authored not GTM. Eased to A only as adversarial caution: the no-steer call rests on a second-hand (aggregator) demand corpus. |
| self_validation_honesty \* | A+ | ↑↑ (B) | **Blocker cleared.** 9-source validation block; all 9 manifest line numbers exact; fail-closed; honest Plausible code-half-done disclosure. |
| pmf_read_accuracy | A | = | pmf null/not flattered; recommendation NOT_YET, never scale-acquisition; demand emerging firewalled from PMF. |
| compliance | A | = | Draft-only outreach; honesty commits REMOVE overclaims; no fake reviews (Reddit API not circumvented). |
| artifact_freshness | A | = | Pricing aligned everywhere; bootstrap aso "Unlimited" nit FIXED. Minor residual: in-app "Go unlimited." (qualified by adjacent copy). |

### Method
Spawned 5 fresh, independent, adversarial grader subagents (Opus, each told to REFUTE): one per
ship-critical dimension (metric integrity; business-case honesty; roadmap-steer + self-validation
paired; a bundle for the 4 non-critical). Each verified against real code/config: preflight anchor
files, validation-manifest.ts line numbers (all exact), the StoreKit .storekit price file, the
business-case arithmetic (recomputed), the power calc, the live Gmail draft state, and the honesty
commit diffs. The Auditor confirmed VISION.md authorship (owner, not GTM) and issue #208's closure.

### Ship gate
**MET.** All 4 ship-critical dimensions A/A+ (metric_integrity A, business_case_honesty A+,
roadmap_steer A, self_validation_honesty A+); all non-critical A; none null. The #208 fix removed the
only blocker.

### Gaps filed
- **None filed this run.** No ship-critical dimension is below A; no fabricated metric, gamed number,
  or speculative steer exists. The 3 remaining gaps are all low-severity (as_of freshness; demand
  corpus is second-hand; in-app bare "unlimited") and already self-tracked by the GTM Factory in
  GROWTH_STATUS `next_actions` — filing gtm-quality issues for A-grade trivia would be noise.
- Issue #208 was already closed-completed (2026-07-01); no action needed.

### Read for next run
- Diff every dimension vs the table above. Watch for REGRESSIONS now that the gate is met — the risk
  flips from "is the blocker fixed" to "did an A/A+ dimension slip." Re-verify each run: the Gmail
  draft state, the 5 preflight anchors, validation-manifest line numbers, the StoreKit price file,
  and that no ARR was booked for an unbuilt lever (credit packs).
- If a future run reaches primary demand sources (App Store RSS feeds) OR the GTM Factory opens a
  ROADMAP/VISION steer built on the current aggregator corpus, re-scrutinize roadmap_steer hard —
  that A currently rests on the corpus staying non-decisional (recommend-only).
- as_of freshness recurs (1d stale again). Low severity; note it, don't inflate a fix that isn't the
  Auditor's to make.
