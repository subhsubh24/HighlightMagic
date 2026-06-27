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
- phase advances pre_launch -> launching -> post_launch. Post-launch is the most important window.
- as_of is stamped every update; a stale as_of is itself a signal.

```yaml
GROWTH_STATUS:
  project: HighlightMagic
  as_of: 2026-06-27
  phase: pre_launch              # pre_launch | launching | post_launch
  engine_built: false            # E6 not yet built; waitlist stubs to console.log
  channels_connected: []         # none connected yet
  awaiting_connect: true         # owner must connect channels before agent executes externally
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
    - "E1-E5 all merged (landing, brand, ASO, content, analytics). E6 not started — engine not built."
    - "Email sequences (welcome to win-back) were entirely absent — highest-leverage PREPARE gap; created 2026-06-27."
    - "CONNECT.md (E6e owner runbook) was missing — created 2026-06-27 to give owner a clear path to execute mode."
    - "Free-tier watermark must be stated accurately in all emails: free exports have a watermark; Pro removes it."
    - "No channels connected; all funnel metrics correctly 0/null (real data only — none invented)."
  next_actions:
    - "If owner connects Resend: queue welcome email to existing waitlist; pull real list_size from Resend Audience."
    - "If owner provisions Vercel KV: wire /api/waitlist to store signups; pull real waitlist_signups_total."
    - "If still no connections at Run 2: draft post-batch-2.md (12 more video scripts, new niches)."
    - "Check if product loop has built E6a (waitlist datastore) or E6b (email send) — flip engine_built if so."
    - "CIRCUIT BREAKER: if connect-channels still open at Run 3, escalate prominently in report."
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
