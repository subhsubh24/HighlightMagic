# Loop health — is the LOOP getting better, not just busier?

The deep audit + QUALITY_SCORECARD measure the PRODUCT. This measures the LOOP itself. Update the
fenced `LOOP_HEALTH` block below EVERY run, in the bookkeeping PR, with REAL counts (from git/gh +
this run). Honest only — same anti-gaming rule as the business-case number; never inflate "shipped"
or hide abandons. It is dashboard-readable OBSERVABILITY, **not a ship gate** (it never blocks merge
or readiness). Two rules: (1) CLASSIFY every abandoned change with a reason so the loop does NOT
re-attempt the same dead-end (the build-loop "don't repeat the failed path"); (2) read `signal`
honestly — `churning` (high abandon/revert vs shipped) or `stuck` (recurring failures / no
convergence) is the trigger to open ONE `loop: harness improvement proposal` issue (the META rule —
the only channel by which the loop's own rules improve, since it can't edit its routine/`.claude`).

```yaml
LOOP_HEALTH:
  project: HighlightMagic
  as_of: 2026-06-28
  last_run: null
  last_deep_audit: null
  this_run:
    changes_shipped: 0
    changes_abandoned: 0
    abandoned_reasons: []        # [{change, reason}] reason ∈ gate_web_build|gate_web_test|gate_lint|gate_ios_ci|review_value|review_correctness|circuit_breaker|conflict|dead_end|blocked_owner
    verify_cycle_failures: 0
    review_rejections: 0
    circuit_breaker_trips: 0
  rolling_7d:
    merged_prs: 0
    reverts: 0
    readiness_attempts: 0
    readiness_rejected: 0
    recurring_failures: []
    harness_proposals_open: 1    # "enforce loop gates as required CI checks" — staged docs/ci/PROPOSED_CI.md (owner applies)
  signal: bootstrapping          # bootstrapping | improving | steady | churning | stuck
```

## How to read it (owner)
- `improving`/`steady` = healthy: shipped >> abandoned, few reverts, no recurring wall.
- `churning` = lots of abandons/reverts relative to shipped → the loop is busy, not better.
- `stuck` = the same wall keeps recurring with no convergence → open a `loop: harness improvement
  proposal` (the loop can't change its own rules; only the human can, and only off that signal).
- `abandoned_reasons` is the memory that stops dead-ends being re-attempted; `gate_ios_ci` matters
  most here (the loop can't xcodebuild on Linux, so iOS failures are verified only via the macOS CI).
