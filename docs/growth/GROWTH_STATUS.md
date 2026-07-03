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
  as_of: 2026-07-03
  phase: pre_launch              # pre_launch | launching | post_launch
  engine_built: true             # COMPUTED: == (engine_pct == 100); E6 plumbing shipped in code (#123)
  engine_pct: 100                # COMPUTED from E6 anchor files on disk (5/5: waitlist/confirm, email, social queue, metrics, CONNECT.md). DO NOT hand-edit
  channels_connected: []         # none connected yet (engine built in code, not yet live externally)
  awaiting_connect: true         # owner must connect channels before agent executes externally
  site_gate_up: false            # HARD precondition (ROADMAP D6): pre-launch SITE GATE confirmed UP. While phase=pre_launch, EXECUTE-mode public outreach is FORBIDDEN unless this is true. Flips true only once the owner applies the gate (sets SITE_GATE_PASSWORD)
  validation:                    # SELF-VALIDATION (GTM_STANDARD S4) — every external source this agent depends on, checked against the REAL code/config this run (2026-07-03: re-verified validation-manifest.ts env-var names unchanged since Run 4 — grep confirms same line numbers), never asserted from memory
    as_of: 2026-07-03
    sources:
      - name: in_app_analytics
        provider: Plausible
        status: unavailable
        why: "web/src/lib/analytics.ts implements trackEvent() but the Plausible <script> tag is NOT present in web/src/app/layout.tsx (verified by grep this run) — trackEvent no-ops with no script loaded; zero events captured anywhere"
        owner_action: gtm-connect-analytics
      - name: analytics_pull_api
        provider: "internal /api/growth/stats (E6d)"
        status: unavailable
        why: "GROWTH_AGENT_SECRET env var unset (web/src/lib/validation-manifest.ts:163) — the endpoint returns 503; this run's numbers come from reading PENDING_OPS/code state directly, not a live pull"
        owner_action: gtm-connect-analytics
      - name: billing
        provider: "StoreKit / App Store Connect"
        status: unavailable
        why: "No live pro.monthly/pro.yearly subscription products in App Store Connect; APP_STORE_ROOT_CA_PEM unset (validation-manifest.ts:119) so server-side JWS verification denies Pro entitlement by secure default"
        owner_action: storekit-products     # existing PENDING_OPS item covers this source — not duplicated
      - name: email
        provider: Resend
        status: unavailable
        why: "RESEND_API_KEY unset (validation-manifest.ts:77) — web/src/lib/email/ stays in dry-run; no transactional or lifecycle email sends"
        owner_action: gtm-connect-email
      - name: datastore
        provider: "Vercel KV"
        status: unavailable
        why: "KV_REST_API_URL / KV_REST_API_TOKEN unset (validation-manifest.ts:103,110) — waitlist signups exist only in ~7-day Vercel function logs, not persisted; falls back to in-memory, so /api/growth/stats has nothing durable to read"
        owner_action: gtm-connect-datastore
      - name: social_x
        provider: X (Twitter)
        status: unavailable
        why: "X_API_BEARER_TOKEN unset (validation-manifest.ts:155) — web/src/lib/social/queue.ts accepts drafts but refuses to post"
        owner_action: gtm-connect-social
      - name: social_instagram
        provider: Instagram
        status: unavailable
        why: "INSTAGRAM_ACCESS_TOKEN unset (validation-manifest.ts:137)"
        owner_action: gtm-connect-social
      - name: social_tiktok
        provider: TikTok
        status: unavailable
        why: "TIKTOK_ACCESS_TOKEN unset (validation-manifest.ts:149)"
        owner_action: gtm-connect-social
      - name: social_reddit
        provider: Reddit
        status: unavailable
        why: "REDDIT_ACCESS_TOKEN unset (validation-manifest.ts:143)"
        owner_action: gtm-connect-social
    unavailable_count: 9
    available_count: 0
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
  demand_signal:                 # PRE-LAUNCH DEMAND VALIDATION (GTM_STANDARD S10) — a LEADING indicator, NEVER PMF. Real cited public evidence only.
    as_of: 2026-07-03
    method: >-
      WebSearch this run (2026-07-03) for real public complaints/reviews about video-highlight
      editing pain and existing AI clip tools. Primary platform pages (Reddit threads, Trustpilot
      review pages, App Store review pages, a journalist bio page) returned HTTP 403 to WebFetch
      this run, so citations below are 2026-dated review-aggregator/blog articles that quote or
      summarize the underlying reviews — each cited by URL, none fabricated.
    themes:
      - theme: "Manual highlight editing is a large, structural time cost"
        recency: durable
        confidence: high
        examples:
          - quote: "'Manually scrubbing through hours of VODs takes forever' / manual editing 'take[s] 4 to 6 hours per video'"
            source: "https://blog.eklipse.gg/streaming-tips/video-editing/how-to-create-highlight-reel-save-time.html"
            date: "2026"
          - quote: "the difference between a 4-hour edit and a 40-minute one"
            source: "https://www.twoaveragegamers.com/the-complete-ai-tool-stack-for-twitch-streamers-2026/"
            date: "2026"
          - quote: "press a button and get highlight clips right as they happen ... saves about 2 hours per game"
            source: "https://www.fullcourt.ai/"
            date: "2026"
        solved_by_product: "YES — HighlightMagic's core loop (auto-detect + auto-export) is a direct answer to this, vs manual scrubbing."
      - theme: "Established AI clip tools are audio/transcript-first and mis-select on visually-driven, low-dialogue footage (gaming, sports)"
        recency: "durable — recurring across multiple independent 2026 comparison pieces"
        confidence: moderate
        examples:
          - quote: "the AI consistently selects commentary moments over gameplay highlights"
            source: "https://snowball-for-streamers.com/en/blog/opus-clip-doesnt-work-for-gaming"
            date: "2026"
          - quote: "visual-heavy content without clear dialogue still underperforms, and dedicated gaming clip tools work better"
            source: "https://www.ngram.com/blog/opus-clip-vs-vizard"
            date: "2026"
        counter_signal: >-
          NOT white space: Eklipse (eklipse.gg) is an established gaming-specific AI clipper
          ("trained on 1,000+ game titles", claims 1M+ streamers) — so "AI gaming-clip tool" itself
          is already served. HighlightMagic's real differentiation vs Eklipse is multi-vertical
          iOS-native scope (gaming AND sports AND events AND family in one mobile app), not a
          "no one does gaming well" claim — do not market it that way.
        solved_by_product: "PARTIAL — frame-based visual scoring (not transcript-based) fits this gap architecturally, but the gaming-specific niche has a dedicated, trusted incumbent; differentiate on breadth + mobile-native workflow."
      - theme: "Existing tools carry real, current reliability + pricing-trust friction (processing failures, opaque credits, hard-to-cancel billing)"
        recency: "current — 2026 reviews of ongoing, unresolved issues"
        confidence: high
        examples:
          - quote: "Videos hang for hours, and often never finish processing"
            source: "https://www.ssemble.com/blog/opus-clip-review-2026"
            date: "2026"
          - quote: "'a shocking 1.2 out of 5-star rating' on Trustpilot; users report still being charged after attempting to cancel"
            source: "https://1trustreview.com/review/capcut"
            date: "2026"
          - quote: "'creative ways to extract more money at every friction point' (Descript's AI-credit system)"
            source: "https://www.trustpilot.com/review/descript.com"
            date: "2026"
        solved_by_product: >-
          PARTIAL / ASPIRATIONAL — HighlightMagic's flat pricing (5 free/mo, $14.99/mo or
          $149.99/yr Pro, no credit-expiry traps) structurally avoids the cited credit/cancellation
          complaint pattern, but this is an unproven claim pre-launch (zero real users yet) — not a
          guarantee until actual reliability + cancel-flow UX earns it.
      - theme: "The youth-sports highlight moment is a contested sub-niche with dedicated competitors"
        recency: current
        confidence: moderate
        examples:
          - quote: "press a button and get highlight clips right as they happen ... saves about 2 hours per game"
            source: "https://www.fullcourt.ai/"
            date: "2026"
          - detail: "XbotGo Chameleon (hardware camera + auto-highlights), Athlete AI Sports Reel Editor, and MOJO Sports all target the youth-sports highlight moment specifically"
            source: "https://apps.apple.com/us/app/athlete-ai-sports-reel-editor/id6469645741"
            date: "2026"
        counter_signal: "Several dedicated apps/hardware already target this exact sub-niche. HighlightMagic's differentiator there is 'bring any footage you already have' (no special camera/hardware), not novelty of the JTBD."
        solved_by_product: "PARTIAL — general-purpose (any raw footage), not sports-specific features (e.g. player/jersey tracking) these dedicated tools may offer."
    synthesis: >-
      The core job-to-be-done HighlightMagic addresses — turning raw footage into a shareable
      highlight without hours of manual scrubbing — is REAL, RECURRING, and durable across years of
      tooling coverage, not a fad (confidence: high). The "visual/gaming content is underserved"
      wedge is directionally true (the dominant general tools are audio/transcript-first) but is NOT
      white space: Eklipse is an established, dedicated gaming-clip competitor, and the youth-sports
      niche has several dedicated apps/hardware. Existing general tools (Opus Clip, CapCut, Descript)
      carry real, current trust friction (processing failures, opaque credits, hard-to-cancel
      billing) that HighlightMagic's flat, transparent pricing structurally avoids IF it delivers
      reliably — an unproven claim pre-launch, not a guarantee.
    reconciliation: >-
      No BUSINESS_CASE number changes — this qualitative signal validates the JTBD and sharpens
      competitive awareness; it does not supply a conversion/pricing/CAC figure to model, so
      arr_year1/floor_met_year1 stay as-is (anti-gaming: no number invented from a qualitative
      signal). Directionally it RAISES confidence that the core problem is real and durable
      (supports, does not require lowering, the existing funnel assumptions) and ADDS
      competitive-landscape awareness (Eklipse + youth-sports-specific tools were absent from the
      Section 2 comp table) — logged as a Section 2 addendum in docs/BUSINESS_CASE.md, not a
      re-priced table.
    disconfirming_notes:
      - "The 'gaming/visual content underserved' claim is only partially true — Eklipse already serves it directly and claims 1M+ streamers; do not market HighlightMagic as 'the only tool that works for gaming highlights.'"
      - "The youth-sports highlight moment is a contested sub-niche with dedicated competitors; HighlightMagic's differentiator there is breadth (any footage, no special hardware), not novelty of the underlying need."
    limitation: >-
      Primary sources (Reddit threads, Trustpilot review pages, App Store review pages, a
      journalist bio page) returned HTTP 403 to WebFetch this run; citations are 2026-dated
      review-aggregator/blog articles that quote or summarize the underlying reviews (URLs above),
      not raw platform pages fetched directly. Try alternate access paths (e.g. App Store RSS review
      feeds) in a future run to reach primary sources.
  outreach:                      # STRATEGIC OUTREACH (docs/growth/OUTREACH.md) — DRAFT-ONLY, owner sends. REAL numbers; replies owner-reported, never fabricated; 0/null pre-launch
    drafted_7d: 1                # curated 1:1 Gmail drafts created for the owner in the last 7d (Run 3: Sam Gutelle, Tubefilter)
    owner_sent_7d: 0             # of those, how many the owner actually sent (owner-reported)
    replies_7d: 0                # replies received (owner-reported, never fabricated)
    signal: none                 # honest read: none | weak | emerging | strong
  channels: []                   # [{name, status, reach_7d, clicks_7d, signups_7d, ctr, notes}]
  experiments:                    # [{id, hypothesis, status, result, lift_pct, started, decided}] — DESIGNED, not run: no experiment engine (ROADMAP E8 unbuilt) and zero traffic (pre-launch, no channel connected)
    - id: exp-landing-h1-benefit-vs-outcome
      hypothesis: "Landing hero H1 'Hours of Footage. One Tap. Ready to Post.' (concrete time-to-value) lifts visitor->waitlist signup rate vs the live H1 'Turn Your Best Moments Into Viral Highlights' (aspirational outcome, web/src/app/landing/page.tsx:355-358), because a legible, specific benefit converts cold traffic better than an aspirational claim ('viral' is unverifiable and reader-skeptical)."
      metric: visitor_to_waitlist_rate
      baseline_assumption: "5% (typical waitlist-landing benchmark; NOT this product's measured rate - none exists pre-launch, stated as an assumption per ANALYSIS_PLAYBOOK significance rules)"
      minimum_sample_size: "4420 total visitors (2210/arm) to detect a 5%->7% absolute lift (40% relative) at alpha=0.05, power=0.80, two-proportion z-test"
      status: designed
      result: null
      lift_pct: null
      started: null
      decided: null
      blocker: "Requires ROADMAP E8 (experiment engine: sticky variant assignment + exposure/conversion logging) AND real visitor traffic (channel connection + site_gate_up) - neither exists yet. Recorded here so the test is ready to launch the day both land, per ANALYSIS_PLAYBOOK step 4."
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
    - "Run 4 (2026-07-01): closed the independent GTM Auditor's ship-critical gap (issue #208, GTM_SCORECARD self_validation_honesty: B) by adding a structured validation/sources block to this YAML — 9 external sources enumerated (Plausible analytics, the internal stats-pull API, StoreKit billing, Resend email, Vercel KV datastore, and 4 social channels), each checked against the REAL code this run (validation-manifest.ts env-var names, a grep confirming the Plausible script is NOT in layout.tsx) and correctly all 'unavailable'. Split the old single 'connect-channels' owner action into per-source gtm-connect-<source> items in PENDING_OPS.md per GTM_STANDARD S4 naming."
    - "Designed (not run) the first landing-page experiment: H1 copy variant (benefit/time-to-value framing vs the live aspirational framing), with a real power calc (n=4420 total, 5%->7% MDE, 80% power) — recorded in experiments[] as status:designed since neither the experiment engine (E8) nor traffic exists yet. Ready to launch the moment both land."
    - "connect-channels has now been open 4 consecutive runs (Run 1-4). No new owner action taken between Run 3 and Run 4 (PENDING_OPS + CONNECT.md unchanged). Per Run 3's own guidance: not re-escalating with new prose — the ask is unchanged (connect Resend, ~5 min, see CONNECT.md Step 1) and repeating it does not help; kept this run's PREPARE work to the two items above instead of padding."
    - "Run 5 (2026-07-03): connect-channels is now open 5 consecutive runs — still no email/datastore/analytics/social connection (spend-caps DID close, owner-attested 2026-07-02, so that's off the blocker list now). Per the Run 3/4 discipline: not re-escalating with new prose, the ask is unchanged. GTM_SCORECARD (as_of 2026-06-30) has NOT been re-graded since Run 4 closed the self_validation_honesty gap (#208) — still shows the pre-fix B; nothing further for this agent to do there until the independent Auditor re-runs. Built the demand_signal block GTM_STANDARD S10 requires (new this run, added 2026-07-01 to the standard — genuinely missing before now): WebSearch found real, cited 2026 evidence that the core JTBD (manual highlight editing is a multi-hour time cost) is real and durable, but also real counter-signal — Eklipse is an established dedicated gaming-clip AI competitor and the youth-sports-highlight niche has several dedicated apps/hardware (FullCourt.ai, XbotGo, Athlete AI, MOJO), so 'gaming/sports is underserved' is only partially true; logged honestly including the disconfirming notes. No BUSINESS_CASE number changed (qualitative signal only) — added a competitive-landscape addendum to Section 2. Primary sources (Reddit, Trustpilot, App Store reviews, a journalist bio page) all returned HTTP 403 to WebFetch this run; citations are dated 2026 aggregator articles that quote the underlying reviews, not raw platform pages — a tooling limitation to note, not a fabrication. Checked for a new strategic-outreach target (a gaming/esports journalist, given the Eklipse finding) but could not verify their specific beat (tool coverage vs match reporting) after the bio-page fetch was blocked — correctly drafted ZERO new outreach rather than guess; the Sam Gutelle draft from Run 3 is still unsent."
  next_actions:
    - "CIRCUIT BREAKER — 5 runs open: owner must connect Resend (docs/growth/CONNECT.md Step 1, ~5 min, free) + set SITE_GATE_PASSWORD to unlock execute mode. No new action needed from this agent until one of those changes — see PENDING_OPS.md gtm-connect-email / site-gate."
    - "Owner: review + send the Sam Gutelle / Tubefilter Gmail draft (search inbox drafts for 'Highlight Magic (iOS, pre-launch)'). Add full name, business address, one specific article reference first."
    - "If owner connects Resend: queue welcome email to existing waitlist; pull real list_size from Resend Audience."
    - "If owner provisions Vercel KV + sets GROWTH_AGENT_SECRET: pull real waitlist_signups_total from /api/growth/stats instead of reading code state."
    - "Once the experiment engine (ROADMAP E8) ships AND a channel connects: run exp-landing-h1-benefit-vs-outcome (already designed, see experiments[]) rather than designing a new one."
    - "Watch for the independent GTM Auditor to re-grade self_validation_honesty (still shows the pre-fix B as of 2026-06-30); if still B after re-grading, re-examine why the Run 4 fix didn't close it."
    - "If a future run can reach primary review sources (Reddit/Trustpilot/App Store pages were all 403 to WebFetch this run): deepen the demand_signal citations with direct platform quotes instead of aggregator-article summaries."
  owner_blockers:
    - "gtm-connect-email: connect Resend (docs/growth/CONNECT.md Step 1) to unlock transactional + lifecycle email"
    - "gtm-connect-datastore: provision Vercel KV (CONNECT.md Step 3) so waitlist signups persist + /api/growth/stats has real data"
    - "gtm-connect-analytics: add the Plausible <script> to web/src/app/layout.tsx AND set GROWTH_AGENT_SECRET so this agent can pull real funnel numbers instead of 0/null"
    - "gtm-connect-social: connect at least one of X / Instagram / TikTok / Reddit API credentials to unlock the publishing queue"
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
