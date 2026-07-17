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
  as_of: 2026-07-17
  enforced_in_ci: true           # quality gates are REQUIRED checks [web, web-lint, web-e2e, validate-capabilities, validate-gtm] with enforce_admins ON — a broken-for-a-user or lint-dirty change CANNOT auto-merge, and even --admin can't bypass (ios is a NON-required advisory check)
  last_run: 2026-07-17
  last_deep_audit: 2026-07-17
  validation:                    # self-validation capability gate (ROADMAP G8). TWO DISTINCT blocked-states — do NOT conflate:
                                 #   owner_blocked / `unmet` = the OWNER must provide a key/secret (this is what the dashboard shows as "needs your key").
                                 #   awaiting_loop_eval      = key/prereq ALREADY PROVIDED; the LOOP must BUILD the eval (loop work, ROADMAP G3) — NOT owner-blocked.
                                 # RULE: never list a capability whose key is already set in `unmet` — it belongs in awaiting_loop_eval.
    enforced_in_ci: true         # `validate-capabilities` is a REQUIRED check; a new unregistered external service CANNOT merge
    capabilities_total: 12       # distinct external services in web/src/lib/validation-manifest.ts
    ci_validated_keyless: 3      # mock, green every PR: Resend (flow), Turnstile, Vercel KV
    live_eval: 3                 # ALL 3 VALIDATED via real paid round-trips. Anthropic (detect 4/4 + frame-scoring), ElevenLabs (TTS), AtlasCloud/Kling (image→video) all GREEN in live-eval run 28912951013 (2026-07-08).
    owner_only: 6                # Apple StoreKit receipt, site-gate, Instagram/Reddit/TikTok/X — validated at launch (existing OWNER_ACTIONs)
    owner_blocked: 0             # capabilities the OWNER must still act on (key/secret) — NONE: all three AI keys were set 2026-07-01 (validation-capability-* OWNER_ACTIONS are done)
    unmet: []                    # = owner_blocked ids the dashboard renders as "needs your key". EMPTY — every AI key is provided; do NOT put a key-provided capability here.
    awaiting_loop_eval: []       # EMPTY — both evals are now built AND GREEN in live-eval run 28912951013 (2026-07-08):
                                 #   elevenlabs (G3 rung 4): src/evals/elevenlabs.eval.ts — real TTS round-trip, in-bounds audio, VALIDATED.
                                 #   atlascloud (G3 rung 6): src/evals/atlascloud.eval.ts — real Kling image→video, status=completed + valid MP4 URL, VALIDATED
                                 #     (fixed en route: submitPhotoAnimation snapped an invalid duration 2 → 5; PR #386. The fixture keeps durationSec=2 as the regression test.)
  this_run:                     # Run 80 (2026-07-17)
    changes_shipped: 3          # #529 a11y focus rings, #530 security H2 vision+planner body cap, #531 waitlist-store KV coverage
    changes_abandoned: 1
    abandoned_reasons:          # [{change, reason}] reason ∈ gate_web_build|gate_web_test|gate_lint|gate_ios_ci|review_value|review_correctness|circuit_breaker|conflict|dead_end|blocked_owner
      - change: "atlascloud generateLipSync/generateStyleTransfer coverage"
        reason: review_value    # Reviewer B: dead code — the one-shot generate* wrappers have NO production callers (routes call submit* directly). Pivoted the slot to reachable waitlist-store KV coverage (#531).
    verify_cycle_failures: 0    # all 3 shipped changes went green on the web gate first try
    review_rejections: 4        # maker≠checker caught real defects, all resolved before merge: #530 v1 (BOTH reviewers — 300MB cap would 413 legit large /api/plan; re-scoped to 2 caps + ios-plan, cycle-2 APPROVE), #529 (Rev B — 2 missed text-sm support links, fixed), atlascloud (Rev B — dead code, pivoted). Change #531 both APPROVE first pass.
    circuit_breaker_trips: 0
  rolling_7d:
    merged_prs: 53              # git log origin/main --since=2026-07-10 (merges with #N)
    reverts: 0
    readiness_attempts: 0       # still blocked on the 3 owner/iOS ship-critical dims (store_readiness C, functional_reality B, tests_evals B)
    readiness_rejected: 0
    recurring_failures: []
    harness_proposals_open: 0    # #163 "enforce gates as required CI checks" APPLIED in #164 (web-e2e+web-lint REQUIRED). Deploy-automation Part B (auto-migrate) = N/A: no SQL DB to migrate.
  signal: improving              # bootstrapping | improving | steady | churning | stuck — 3 shipped vs 1 abandoned (pivoted, not a dead-end wall), 0 reverts, 0 circuit-breaker trips; maker≠checker catching real regressions before merge is the gate working
```

## How to read it (owner)
- `improving`/`steady` = healthy: shipped >> abandoned, few reverts, no recurring wall.
- `churning` = lots of abandons/reverts relative to shipped → the loop is busy, not better.
- `stuck` = the same wall keeps recurring with no convergence → open a `loop: harness improvement
  proposal` (the loop can't change its own rules; only the human can, and only off that signal).
- `abandoned_reasons` is the memory that stops dead-ends being re-attempted; `gate_ios_ci` matters
  most here (the loop can't xcodebuild on Linux, so iOS failures are verified only via the macOS CI).
