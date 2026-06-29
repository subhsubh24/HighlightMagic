# GROWTH STATUS — HighlightMagic

The single, machine-readable source of truth for growth & marketing progress, owned by the Growth
Agent (the daily cloud routine). The factory dashboard reads the fenced GROWTH_STATUS block below,
exactly like it reads BUSINESS_CASE_SUMMARY in docs/BUSINESS_CASE.md.

## Contract (read before editing)
- The Growth Agent updates the block below every run, in the same run it does growth work.
- Real data only — never invent numbers. A metric no connected source has reported stays 0 or null.
- The block MUST be valid, parseable YAML — no invalid escapes (write $100K, never \$100K); quote any
  value containing a colon or backtick. preflight fails on a malformed block.
- Cross-project shape: identical keys across AptDesignerAI / HighlightMagic / GroceryManager.
- `engine_pct` (0–100) and `engine_built` are PINNED TO CODE, not a vibe: preflight computes
  `engine_pct` from how many E6 growth-execution-engine anchor files physically exist on disk and
  REJECTS any declared value that differs, and enforces `engine_built == (engine_pct == 100)`. Do
  NOT hand-flip them ahead of the code — set them to whatever preflight computes (run preflight to
  check). They only rise as the real E6 anchor files land in `web/`.
- phase advances pre_launch -> launching -> post_launch. Post-launch is the most important window.
- as_of is stamped every update; a stale as_of is itself a signal.
- METHOD: each run, follow docs/growth/ANALYSIS_PLAYBOOK.md — act as an applied growth data scientist:
  privacy-safe AGGREGATES only (no raw PII/events), diagnose the single binding constraint, compute
  significance/CI and say "insufficient data" when N is small, design experiments (run via the
  experiment engine when built, else record the designed test + flag the engine as blocker — never
  fabricate a result), and recommend the highest-ROI lever. Correlation ≠ causation; never invent a metric.

```yaml
GROWTH_STATUS:
  project: HighlightMagic
  as_of: 2026-06-29
  phase: pre_launch              # pre_launch | launching | post_launch
  engine_built: true             # COMPUTED: == (engine_pct == 100); E6 plumbing shipped in code (#123)
  engine_pct: 100                # COMPUTED from E6 anchor files on disk (5/5: waitlist/confirm, email, social queue, metrics, CONNECT.md). DO NOT hand-edit
  channels_connected: []         # none connected yet (engine built in code, not yet live externally)
  awaiting_connect: true         # owner must connect channels before agent executes externally
  site_gate_up: false            # HARD precondition (ROADMAP D6): pre-launch SITE GATE confirmed UP. While phase=pre_launch, EXECUTE-mode public outreach is FORBIDDEN unless this is true. Flips true only once the owner applies the gate (sets SITE_GATE_PASSWORD)
  funnel:                        # REAL numbers only; 0/null until a connected source reports them
    visitors_7d: 0
    waitlist_signups_total: 0
    waitlist_signups_7d: 0
    visitor_to_waitlist_rate: null
    trial_starts_total: 0
    paid_conversions_total: 0
    trial_to_paid_rate: null
    active_subscribers: 0
    mrr_usd: 0
    churn_rate_30d: null
  acquisition:
    cac_usd: null
    ltv_usd: null
    ltv_cac_ratio: null
    top_channel: null
  pmf:                           # PRODUCT-MARKET FIT signals — the leading indicator (FACTORY_STANDARD §9). REAL data only; 0/null pre-launch
    activation_rate: null        # % of new users who reach first value (first shareable export — the "aha")
    retention_d1: null           # % returning day 1
    retention_d7: null           # % returning day 7
    retention_d30: null          # % returning day 30 (a flattening cohort curve = strongest PMF signal)
    organic_share_rate: null     # % of new users arriving via share/referral (is it spreading on its own?)
    signal: null                 # honest read: none | weak | emerging | strong — NEVER flattered
  outreach:                      # STRATEGIC OUTREACH (docs/growth/OUTREACH.md) — DRAFT-ONLY, owner sends. REAL numbers; replies owner-reported, never fabricated; 0/null pre-launch
    drafted_7d: 1                # curated 1:1 Gmail drafts created for the owner in the last 7d (Run 3: Sam Gutelle, Tubefilter)
    owner_sent_7d: 0             # of those, how many the owner actually sent (owner-reported)
    replies_7d: 0                # replies received (owner-reported, never fabricated)
    signal: none                 # honest read: none | weak | emerging | strong
  channels: []                   # [{name, status, reach_7d, clicks_7d, signups_7d, ctr, notes}]
  experiments: []                # [{id, hypothesis, status, result, lift_pct, started, decided}]
  email:
    list_size: 0
    double_opt_in: true
    last_stage_sent: null
    open_rate: null
    click_rate: null
  content:
    published_7d: 0
    scheduled_next_7d: 0
    organic_sessions_7d: 0
  learnings:
    - "E1-E5 merged (landing, brand, ASO, content, analytics); E6 growth-execution plumbing shipped in #123 (waitlist double-opt-in, email/social/metrics) — engine_built in code, dry-run until channels connected."
    - "Email sequences (welcome to win-back) were entirely absent — highest-leverage PREPARE gap; created 2026-06-27."
    - "CONNECT.md (E6e owner runbook) was missing — created 2026-06-27 to give owner a clear path to execute mode."
    - "Free-tier watermark must be stated accurately in all emails: free exports have a watermark; Pro removes it."
    - "No channels connected; all funnel metrics correctly 0/null (real data only — none invented)."
    - "post-batch-2.md created 2026-06-28 (12 scripts: gaming, wedding, fitness, pets, family, car meets, dance, free-vs-Pro x2, food, soccer, extreme sports). Adversarial review fixed 3 issues before merge."
    - "docs/press-kit.md created 2026-06-29. Adversarial review caught 8 real issues: 'Unlimited exports' vs 50/day ceiling contradiction (FTC risk), 'full feature access' falsehood, unconfirmed one-tap deep-link claim, voice-clone biometric compliance complexity, 'every frame' accuracy, base domain gating, internal repo path links, aggregator-sourced pricing. All fixed before commit."
    - "First strategic outreach draft created (Sam Gutelle, Tubefilter) — DRAFT ONLY, awaiting owner review + send. Reviewer flagged: physical address (CAN-SPAM), opt-out language, and personalization (specific article reference) as required before sending."
    - "CIRCUIT BREAKER TRIGGERED at Run 3: connect-channels open 3 consecutive runs. Easiest unlock = Resend (free, 5-min setup) per CONNECT.md."
  next_actions:
    - "CIRCUIT BREAKER TRIGGERED: owner must connect Resend + set SITE_GATE_PASSWORD — both required to unlock execute mode. See CONNECT.md. Resend is free, no credit card, ~5 minutes."
    - "Owner: review + send the Sam Gutelle / Tubefilter Gmail draft (search inbox drafts for 'Highlight Magic (iOS, pre-launch)'). Add full name, business address, one specific article reference first."
    - "If owner connects Resend: queue welcome email to existing waitlist; pull real list_size from Resend Audience."
    - "If owner provisions Vercel KV: wire /api/waitlist to store signups; pull real waitlist_signups_total."
    - "Run 4 PREPARE option: H1 copy variants for the landing page (A/B test copy design, staged for when experiments engine is built)."
  owner_blockers:
    - "spend-caps: URGENT — set hard monthly caps in Anthropic + ElevenLabs + AtlasCloud dashboards now"
    - "connect-channels: connect Resend (email) + Vercel KV per docs/growth/CONNECT.md to unlock execute mode"
    - "vercel-env-keys: set ANTHROPIC_API_KEY + ELEVENLABS_API_KEY + ATLASCLOUD_API_KEY in Vercel env"
    - "server-quota-infra: provision auth layer + Vercel KV for server-side quota (PENDING_OPS.md)"
  links:
    in_app_analytics: null
    owner_doc: docs/growth/GROWTH_STATUS.md
```

## How to read it (owner)

- awaiting_connect: true + engine_built: false => agent is in honest prepare mode; see owner_blockers.
- funnel is the headline: waitlist signups pre-launch, then trial->paid + MRR + churn post-launch.
- experiments is where compounding happens post-launch; learnings is the data-grounded read.

## Phase notes

- Pre-launch: the number that matters is waitlist signups; most of the block is 0/null (correct/honest).
- Launching: trial starts + first conversions appear; experiments run on paywall + onboarding.
- Post-launch: ground every assumption on REAL conversion/retention/CAC data; run continuous
  experiments; double down on what converts; feed winners back into the business case.
