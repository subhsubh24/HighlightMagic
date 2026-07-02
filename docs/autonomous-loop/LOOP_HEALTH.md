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
  as_of: 2026-07-02
  enforced_in_ci: true           # quality gates are REQUIRED checks [web, ios, web-e2e, web-lint] with enforce_admins ON — a broken-for-a-user or lint-dirty change CANNOT auto-merge, and even --admin can't bypass
  last_run: 2026-07-02
  last_deep_audit: 2026-07-02
  validation:                    # self-validation capability gate (ROADMAP G8). TWO DISTINCT blocked-states — do NOT conflate:
                                 #   owner_blocked / `unmet` = the OWNER must provide a key/secret (this is what the dashboard shows as "needs your key").
                                 #   awaiting_loop_eval      = key/prereq ALREADY PROVIDED; the LOOP must BUILD the eval (loop work, ROADMAP G3) — NOT owner-blocked.
                                 # RULE: never list a capability whose key is already set in `unmet` — it belongs in awaiting_loop_eval.
    enforced_in_ci: true         # `validate-capabilities` is a REQUIRED check; a new unregistered external service CANNOT merge
    capabilities_total: 12       # distinct external services in web/src/lib/validation-manifest.ts
    ci_validated_keyless: 3      # mock, green every PR: Resend (flow), Turnstile, Vercel KV
    live_eval: 3                 # Anthropic = VALIDATED 2026-07-01 (real detect eval 4/4 GREEN, ~$0.07/fixture). ElevenLabs + AtlasCloud = keys SET; awaiting their G3 evals being built.
    owner_only: 6                # Apple StoreKit receipt, site-gate, Instagram/Reddit/TikTok/X — validated at launch (existing OWNER_ACTIONs)
    owner_blocked: 0             # capabilities the OWNER must still act on (key/secret) — NONE: all three AI keys were set 2026-07-01 (validation-capability-* OWNER_ACTIONS are done)
    unmet: []                    # = owner_blocked ids the dashboard renders as "needs your key". EMPTY — every AI key is provided; do NOT put a key-provided capability here.
    awaiting_loop_eval:          # key PROVIDED; the LOOP must BUILD the eval before these validate (ROADMAP G3) — NOT owner-blocked, NOT "needs your key"
      - validation-capability-elevenlabs   # key set; TTS round-trip eval not built yet (G3 rung 4)
      - validation-capability-atlascloud   # key set; video-gen round-trip eval not built yet (G3 rung 6)
  this_run:
    changes_shipped: 6          # #243 proxy-video H1, #244 landing honesty+a11y, #245 atlascloud submit-retry, #246 ios-score COGS, #247 plan tests, #248 content honesty
    changes_abandoned: 0
    abandoned_reasons: []        # [{change, reason}] reason ∈ gate_web_build|gate_web_test|gate_lint|gate_ios_ci|review_value|review_correctness|circuit_breaker|conflict|dead_end|blocked_owner
    verify_cycle_failures: 0
    review_rejections: 1         # #248 Rev B first pass (claimed music library is "live" — factually wrong; verified via git that no audio is committed → picker non-functional; note tightened + fresh reviewer APPROVED). All other 11 reviewer verdicts APPROVE first pass.
    circuit_breaker_trips: 0
  rolling_7d:
    merged_prs: 56
    reverts: 0
    readiness_attempts: 0
    readiness_rejected: 0
    recurring_failures: []
    harness_proposals_open: 0    # #163 "enforce gates as required CI checks" APPLIED in #164 (web-e2e+web-lint REQUIRED). Deploy-automation Part B (auto-migrate) = N/A: no SQL DB to migrate.
  signal: improving              # bootstrapping | improving | steady | churning | stuck
```

## How to read it (owner)
- `improving`/`steady` = healthy: shipped >> abandoned, few reverts, no recurring wall.
- `churning` = lots of abandons/reverts relative to shipped → the loop is busy, not better.
- `stuck` = the same wall keeps recurring with no convergence → open a `loop: harness improvement
  proposal` (the loop can't change its own rules; only the human can, and only off that signal).
- `abandoned_reasons` is the memory that stops dead-ends being re-attempted; `gate_ios_ci` matters
  most here (the loop can't xcodebuild on Linux, so iOS failures are verified only via the macOS CI).
