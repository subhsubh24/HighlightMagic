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
  as_of: 2026-07-23
  phase: pre_launch              # pre_launch | launching | post_launch
  engine_built: true             # COMPUTED: == (engine_pct == 100); E6 plumbing shipped in code (#123)
  engine_pct: 100                # COMPUTED from E6 anchor files on disk (5/5: waitlist/confirm, email, social queue, metrics, CONNECT.md). DO NOT hand-edit
  channels_connected: []         # none connected yet (engine built in code, not yet live externally)
  awaiting_connect: true         # owner must connect channels before agent executes externally
  site_gate_up: false            # HARD precondition (ROADMAP D6): pre-launch SITE GATE confirmed UP. While phase=pre_launch, EXECUTE-mode public outreach is FORBIDDEN unless this is true. Run 13 (2026-07-23): re-ran the CHEAP local check only (no signal since Run 12 to justify a 4th paid Browserbase probe — Runs 10/11 already independently confirmed net::ERR_TUNNEL_CONNECTION_FAILED with a live remote browser, Run 12 reconfirmed via local DNS/curl): `dns.resolve4('highlightmagic.app')` -> ENOTFOUND; `curl https://highlightmagic.app` -> CONNECT tunnel failed / 502 (proxy status log: "gateway answered 502 to CONNECT... policy denial or upstream failure"). Identical to every prior run since Run 7. Domain still does not resolve. Stays false (fail-closed, FACTORY_STANDARD S28) — the blocker is unchanged: check DNS/domain-alias config in Vercel, not just "set SITE_GATE_PASSWORD" (see PENDING_OPS site-gate item + owner_blockers below).
  validation:                    # SELF-VALIDATION (GTM_STANDARD S4) — every external source this agent depends on, re-probed against the REAL env/code this run (2026-07-23, Run 13: `env` re-checked for GROWTH_AGENT_SECRET/PROD_URL/RESEND_API_KEY/KV_REST_API_URL/social tokens — all absent, unchanged since Run 6; only BROWSERBASE_API_KEY/BROWSERBASE_PROJECT_ID present, same shared sandbox plumbing. Did NOT re-run the paid Browserbase live-prod probe this run — no signal anything changed since Run 12's cheap check; ran the cheap local DNS/curl check instead, identical result. Domain still does not resolve; no owner action detected.)
    as_of: 2026-07-23
    sources:
      - name: in_app_analytics
        provider: Plausible
        status: unavailable
        why: "CODE HALF NOW DONE (#360, 2026-07-05): web/src/app/layout.tsx conditionally renders the nonce'd Plausible <script> on the production host only (verified by reading the diff this run). Still unavailable: (1) no owner-attested plausible.io account exists for highlightmagic.app yet — a pure external-account fact, not visible to git, and PENDING_OPS.md has no done_on for this step; (2) even once created, getGrowthMetrics() (web/src/lib/growth/metrics.ts, grep-verified this run) reads ONLY the KV waitlist store, never Plausible — so Plausible-sourced visitor numbers still would not reach this agent's pull without a further read integration. funnel.visitors_7d / visitor_to_waitlist_rate stay null even after the account is created until that gap closes."
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
    as_of: 2026-07-23
    overall_strength: emerging   # real, recurring, multi-source cited pain on the core JTBD (theme 1) is genuine, but 3 of 4 themes carry material counter-signal (established incumbents already serve the "underserved" wedges) — not "strong" until HighlightMagic earns its own differentiated proof; not "weak" or "none" given the durable, cross-source core-JTBD evidence.
    method: >-
      Run 13 (2026-07-23): bounded WebSearch for a HighlightMagic-specific public footprint (still
      none, expected pre-launch) and for a named AI-clip-tool-beat journalist (again only unattributed
      aggregator/roundup content, no individual with a verifiable beat — same dead end as Runs
      5/6/7/9/10/11/12, now 7 consecutive runs). Deliberately did NOT re-run the App Store RSS
      technique against a 5th competitor (Descript, flagged as untried in Run 12's next_actions):
      theme 3 already has 4 independent primary sources / 8 citations, well past the >=2-source
      corroboration bar, and Run 12's own learning is that this technique has only ever surfaced
      theme-3-shaped evidence (never themes 1/2/4) — a 5th same-shaped citation would be padding, not
      a genuinely new deliverable. Themes 1-4 and all citations are UNCHANGED this run — no new
      evidence found, none forced in.
      Run 12 (2026-07-19): extended Run 11's primary-source technique (Apple's unauthenticated App
      Store customer-review RSS/JSON feed) to 2 MORE named competitors, closing part of Run 11's own
      next_actions gap ("a future run could extend the same technique to more competitors"). Found
      real App Store IDs via WebSearch for OpusClip (id6743615403) and Vizard (id6748490660) and
      FullCourt.ai (id1534211457), fetched all three review feeds. FullCourt.ai's most recent reviews
      (bug/tracking complaints, newest dated 2026-02-07) added no new citable pattern beyond what
      theme 4 already covers — correctly not forced in. OpusClip and Vizard both surfaced new,
      CURRENT, primary evidence for theme 3: an OpusClip 1-star review dated 2026-07-12 ("Rip Off")
      reporting a paid watermark-removal purchase that produced a broken (still-photo) export and
      burned credits with no refund path; and a cluster of Vizard reviews (2026-04-07 to 2026-06-29,
      3 independent 1-2 star reviews) reporting the mobile app does not actually deliver the features
      advertised — editing/prompt actions silently no-op on-device, real functionality is web-only.
      Verified BOTH extraction was not a paraphrase/hallucination by re-fetching the raw JSON for the
      OpusClip "Rip Off" entry and the Vizard "Not a real mobile app" entry and confirming an exact
      character match to the summarized quotes before citing either (see primary_examples). The
      Vizard mobile-incompleteness pattern is evidence for a DIFFERENT angle than theme 2's existing
      framing (audio/transcript mis-selection) — it is a trust/delivery-gap complaint (advertised
      mobile features don't work on mobile), so it was added to theme 3 (the existing
      reliability/trust-friction theme) rather than invented as a new theme; it also only has ONE
      independent source (Vizard's own reviews) so it does not by itself clear the S10 auto-steer
      corroboration bar (needs >=2 independent sources) even though theme 3 as a whole already does.
      A bounded WebSearch for a HighlightMagic-specific public footprint found nothing (expected,
      pre-launch) and a bounded search for a named AI-clip-tool-beat journalist again surfaced only
      unattributed aggregator/roundup content, no individual with a verifiable beat — correctly zero
      new outreach drafts, same dead end as Runs 5/6/7/9/10/11. Themes 1/2/4 and their existing
      citations are UNCHANGED — no reason found to re-derive them; only theme 3 gained new evidence.
    sources_covered:
      - "competitor/review-aggregator blog articles (blog.eklipse.gg, twoaveragegamers.com, fullcourt.ai, snowball-for-streamers.com, ngram.com, ssemble.com, 1trustreview.com) — reachable via WebSearch"
      - "an App Store listing page (apps.apple.com) for a named competitor app"
      - "a Trustpilot review quoted via an aggregator (trustpilot.com/review/descript.com, reached via WebSearch synthesis, not direct WebFetch)"
      - "Apple's official App Store customer-review RSS/JSON feed (itunes.apple.com/us/rss/customerreviews) — PRIMARY, unauthenticated, unblocked by WebFetch (unlike the apps.apple.com review-listing page, which still 403s); pulled for CapCut (id1500855883) and Eklipse.gg (id1638105930) in Run 11, EXTENDED in Run 12 (2026-07-19) to OpusClip (id6743615403), Vizard (id6748490660), and FullCourt.ai (id1534211457) — raw-JSON-verified before citing"
    sources_unconnected:
      - "reddit_api — Reddit's Responsible Builder Policy requires explicit commercial-mining approval (GTM_STANDARD S10); REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET unset in this run's env — not circumvented"
      - "x_api — paid/gated API; no key set in this run's env"
      - "direct primary-platform fetches (Reddit threads, Trustpilot review pages, the Apple App Store review-LISTING page, Muckrack journalist bios) — WebFetch returned HTTP 403 on every attempt across Runs 5/6; not re-attempted this run (no reason to expect a different result). NOTE: the App Store's separate RSS review FEED (distinct endpoint, see sources_covered) is NOT blocked and is now used — this line only covers the still-blocked endpoints."
    themes:
      - label: "Manual highlight editing is a large, structural time cost"
        strength: strong
        cited_count: 3
        quote: "'Manually scrubbing through hours of VODs takes forever' / manual editing 'take[s] 4 to 6 hours per video'"
        url: "https://blog.eklipse.gg/streaming-tips/video-editing/how-to-create-highlight-reel-save-time.html"
        product_solves: yes
        recency: durable
        examples:
          - quote: "the difference between a 4-hour edit and a 40-minute one"
            source: "https://www.twoaveragegamers.com/the-complete-ai-tool-stack-for-twitch-streamers-2026/"
            date: "2026"
          - quote: "press a button and get highlight clips right as they happen ... saves about 2 hours per game"
            source: "https://www.fullcourt.ai/"
            date: "2026"
        solved_by_product: "YES — HighlightMagic's core loop (auto-detect + auto-export) is a direct answer to this, vs manual scrubbing."
      - label: "Established AI clip tools are audio/transcript-first and mis-select on visually-driven, low-dialogue footage (gaming, sports)"
        strength: moderate
        cited_count: 2
        quote: "the AI consistently selects commentary moments over gameplay highlights"
        url: "https://snowball-for-streamers.com/en/blog/opus-clip-doesnt-work-for-gaming"
        product_solves: partial
        recency: "durable — recurring across multiple independent 2026 comparison pieces"
        examples:
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
      - label: "Existing tools carry real, current reliability + pricing-trust friction (processing failures, opaque credits, hard-to-cancel billing)"
        strength: strong
        cited_count: 8
        quote: "Videos hang for hours, and often never finish processing"
        url: "https://www.ssemble.com/blog/opus-clip-review-2026"
        product_solves: partial
        recency: "current — 2026 aggregator reviews PLUS primary App Store reviews spanning 2026-04-07 to 2026-07-15 across 4 named competitors (Eklipse, CapCut, OpusClip, Vizard) — the strongest recency + breadth this theme has had"
        examples:
          - quote: "'a shocking 1.2 out of 5-star rating' on Trustpilot; users report still being charged after attempting to cancel"
            source: "https://1trustreview.com/review/capcut"
            date: "2026"
          - quote: "'creative ways to extract more money at every friction point' (Descript's AI-credit system)"
            source: "https://www.trustpilot.com/review/descript.com"
            date: "2026"
        primary_examples:  # PRIMARY, not aggregator-sourced; raw-JSON-verified before citing (see method above). First 3 added Run 11 (2026-07-17); last 2 added Run 12 (2026-07-19)
          - quote: "Refuse to give refund with same day cancellation of service. You can clip yourselves. Don't overpay a service who won't refund."
            source: "Eklipse.gg App Store review, reviewer 'Jumbo doe', via itunes.apple.com/us/rss/customerreviews/id=1638105930 (title: 'Overcharging', app v2.7.20)"
            date: "2026-07-05"
          - quote: "everything cost premium which is dumb asf / the clipping barely works unless u have premium / u can BARELY connect insta or facebook/tiktok AND U HAVE TO HAVE PREMIUM TO CONNECT YOUTUBE"
            source: "Eklipse.gg App Store review, reviewer 'kj<33333', via itunes.apple.com/us/rss/customerreviews/id=1638105930 (title: 'Buns', app v2.7.19)"
            date: "2026-07-03"
          - quote: "Amazing for beginners. Not really a fan of how they treat their free version customers tho."
            source: "CapCut App Store review, reviewer 'V0id-j132', via itunes.apple.com/us/rss/customerreviews/id=1500855883 (title: 'Good for beginners', app v9.0.0, rating 4/5 — paywall-friction criticism despite an overall-positive review)"
            date: "2026-07-15"
          - quote: "I paid a subscription so that the watermark could be removed. It now only a still photo. I tried to remake video. The finished product is a blank. It happened twice. Now I am out of credits. This is robbery. Please resolve."
            source: "OpusClip App Store review, reviewer 'Myomenigeal', via itunes.apple.com/us/rss/customerreviews/id=6743615403 (title: 'Rip Off', app v1.3.7, rating 1/5) — NEW Run 12, raw-JSON-verified"
            date: "2026-07-12"
          - quote: "None of the features advertised for the mobile app are accessible on the mobile app editing and making changes to the clip are only available on the web version."
            source: "Vizard App Store review, reviewer 'The chairman!', via itunes.apple.com/us/rss/customerreviews/id=6748490660 (title: 'Not a real mobile app', app v1.2.2, rating 1/5) — NEW Run 12, raw-JSON-verified; 2 further independent Vizard reviews report the same mobile-feature-gap pattern (2026-05-20 'Needs work' 2/5, 2026-06-29 'It doesn't do anything, just Captions' 1/5) but are NOT separately quoted here to avoid over-weighting a single competitor's own review feed"
            date: "2026-04-07"
        solved_by_product: >-
          PARTIAL / ASPIRATIONAL — HighlightMagic's flat pricing (5 free/mo, $14.99/mo or
          $149.99/yr Pro, no credit-expiry traps) structurally avoids the cited credit/cancellation
          complaint pattern, and the Vizard mobile-feature-gap pattern (advertised editing features
          silently not working on-device, real functionality gated to the web) is a DIFFERENT
          architectural failure mode HighlightMagic's mobile-native, on-device pipeline (no
          web-only feature tier) structurally cannot reproduce — but both remain unproven pre-launch
          claims (zero real users yet), not guarantees until actual reliability + parity earn them.
      - label: "The youth-sports highlight moment is a contested sub-niche with dedicated competitors"
        strength: moderate
        cited_count: 2
        quote: "press a button and get highlight clips right as they happen ... saves about 2 hours per game"
        url: "https://www.fullcourt.ai/"
        product_solves: partial
        recency: current
        examples:
          - detail: "XbotGo Chameleon (hardware camera + auto-highlights), Athlete AI Sports Reel Editor, and MOJO Sports all target the youth-sports highlight moment specifically"
            source: "https://apps.apple.com/us/app/athlete-ai-sports-reel-editor/id6469645741"
            date: "2026"
        counter_signal: "Several dedicated apps/hardware already target this exact sub-niche. HighlightMagic's differentiator there is 'bring any footage you already have' (no special camera/hardware), not novelty of the JTBD."
        solved_by_product: "PARTIAL — general-purpose (any raw footage), not sports-specific features (e.g. player/jersey tracking) these dedicated tools may offer."
    steers_opened: []
    steers_opened_note: >-
      Themes 1 and 3 numerically clear the S10 corroboration bar (>=3 independent cited posts across
      >=2 independent sources, recent + recurring). No steer was opened for either: theme 1's fit is
      already the product's existing core-loop thesis (auto-detect + auto-export), not a new
      direction; theme 3's fit is already the existing flat-pricing decision (5 free/mo, no
      credit-expiry traps), not an unbuilt gap. Opening a ROADMAP/BUSINESS_CASE steer to "build" what
      is already built would be circular, not a genuine direction-setting action — so zero steers is
      the correct, non-gamed outcome, not a miss.
    disconfirming:
      - "The 'gaming/visual content underserved' claim is only partially true — Eklipse already serves it directly and claims 1M+ streamers; do not market HighlightMagic as 'the only tool that works for gaming highlights.'"
      - "The youth-sports highlight moment is a contested sub-niche with dedicated competitors; HighlightMagic's differentiator there is breadth (any footage, no special hardware), not novelty of the underlying need."
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
    limitation: >-
      FURTHER NARROWED Run 12 (2026-07-19): the App Store RSS review feed now backs theme 3 with 4
      independent competitors' primary reviews (Eklipse, CapCut, OpusClip, Vizard) — tried FullCourt.ai
      too (id1534211457) but its newest review predates the last ~5 months with no new citable pattern,
      so it was correctly not added. STILL OPEN: Reddit threads, Trustpilot review pages, the App Store
      review-LISTING page (apps.apple.com/.../reviews), and journalist bio pages still return HTTP 403
      to WebFetch (not re-attempted this run — no reason to expect a different result); themes 1/2/4
      still rest on aggregator/blog citations only — the RSS-feed technique has only ever surfaced
      evidence matching theme 3's frame (trust/reliability/delivery-gap complaints), not the JTBD
      (theme 1) or mis-selection (theme 2) framings, so a future run should not assume it will
      generalize to those themes without checking.
  launch_readiness:              # GTM phasing + launch timing — FACTORY_STANDARD §11b (method: ANALYSIS_PLAYBOOK "Launch-timing read"). The dashboard reads this; recompute every run.
    phase: build                 # build | assess_demand | launch | post_launch
    product_ready: false         # every ship-critical QUALITY_SCORECARD dim A/A+ AND readiness passed — currently overall B, ship_gate_met false
    demand_signal: insufficient_data   # GTM sources unconnected + 0 visitors/waitlist → demand is UNMEASURABLE (not "low")
    recommendation: NOT_YET      # NOT_YET | START_MARKETING | LAUNCH_WINDOW_OPEN
    reason: >-
      Both launch gates unmet. (1) PRODUCT below the ship bar (independent QUALITY_SCORECARD overall B,
      ship_gate_met=false — the loop keeps building toward A). (2) DEMAND unmeasurable: GTM sources
      unconnected (gtm-connect-* owner actions open — Plausible/KV/Resend unset) and 0 visitors/waitlist,
      so no pull signal can be read. A launch window cannot be computed until demand becomes measurable.
    next_owner_action: >-
      Connect the free GTM sources (Plausible analytics + Vercel KV + Resend, per docs/growth/CONNECT.md)
      and drive some real traffic to the waitlist — without this, demand stays 0/null and launch timing
      cannot be computed. (Product readiness is the loop's job — in progress.)
  outreach:                      # STRATEGIC OUTREACH (docs/growth/OUTREACH.md) — DRAFT-ONLY, owner sends. REAL numbers; replies owner-reported, never fabricated; 0/null pre-launch
    drafted_7d: 0                # curated 1:1 Gmail drafts created for the owner in the last 7d — the one drafted Gmail draft (Sam Gutelle, Tubefilter, created 2026-06-29) is now 24 days old (python3 date-arithmetic verified against as_of 2026-07-23), outside the trailing 7d window; zero NEW drafts created this run (bounded WebSearch for a named AI-clip-tool journalist again found only unattributed aggregator content, same dead end as Runs 5/6/7/9/10/11/12 — correctly zero)
    owner_sent_7d: 0             # of those, how many the owner actually sent (owner-reported) — confirmed via Gmail list_drafts this run: draft still sits unsent, unedited (placeholders [Your Full Name] / mailing address / article reference still unfilled)
    replies_7d: 0                # replies received (owner-reported, never fabricated) — confirmed via search_threads(tubefilter/sam@tubefilter.com) this run: zero replies (one unrelated 2023 email is the only hit)
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
    - "Run 6 (2026-07-05): connect-channels open 6 consecutive runs — no email/datastore/social connection; the product loop DID ship the code half of gtm-connect-analytics (#360, Plausible <script> now wired to layout.tsx, prod-host-gated) since Run 5, so this run corrected the validation.sources[in_app_analytics].why text (was stale — cited the script as absent, which is no longer true) and narrowed the remaining owner ask to just the plausible.io account + GROWTH_AGENT_SECRET. Also confirmed (grep, this run) that getGrowthMetrics() still reads only the KV waitlist store, not Plausible — so visitors_7d/visitor_to_waitlist_rate will stay null even after the account exists, a real remaining gap now flagged. Followed up on the Run 5 gaming/esports-journalist lead: WebSearch (not blocked, unlike WebFetch) confirmed Titas Khan's actual beat is game-news/esports reporting (Valorant, Dota 2, Roblox, mobile games), NOT creator/streaming-tool coverage — does not clear the OUTREACH.md beat-match bar; a second search for named journalists covering AI clip-editing tools surfaced only unattributed review-aggregator sites (agent-finder.co, twoaveragegamers.com), no named individual with a public professional contact. Correctly drafted ZERO new outreach. Ran one light WebSearch check for new HighlightMagic-specific public complaints/reviews (none exist — pre-launch, no public footprint) — the Run 5 demand_signal synthesis needed no update; not re-running the full citation search to avoid duplicative churn on unchanged evidence. GTM_SCORECARD still shows the pre-fix B (as_of 2026-06-30, unchanged) — still the Auditor's turn, not this agent's. Sam Gutelle draft (Run 3) confirmed still unsent, zero replies (Gmail search)."
    - "Run 8 (2026-07-11): connect-channels open 8 consecutive runs — re-probed env for GROWTH_AGENT_SECRET/PROD_URL/RESEND_API_KEY/KV_REST_API_URL/social tokens (all still absent). Since Run 7: the independent GTM Auditor re-graded (Audit Run 2, 2026-07-10) — GTM_SCORECARD.md now shows overall A, ship_gate_met TRUE (self_validation_honesty A+, business_case_honesty A+), resolving the 3+-run staleness this agent had been flagging; this does NOT unlock outbound marketing on its own — GTM_STANDARD S13 Gate 1 keys off the PRODUCT QUALITY_SCORECARD, which is still overall B / ship_gate_met false (store_readiness C, an owner-only Xcode/Mac gap, unchanged 5 cycles) — correctly stayed in PREPARE. Also found and fixed a REAL pre-existing honesty defect (not new since Run 7 — present since Run 2/3 when the batches were written, only now caught): every one of the 24 queued short-form video scripts in docs/content/post-batch-1.md and post-batch-2.md had a CTA asserting the app was ALREADY live and downloadable ('Free on the App Store', 'Download free → link in bio', a #AppStore hashtag) when the product is pre_launch with only the public waitlist open — a direct GTM_STANDARD S13 violation waiting to fire the moment a social channel connects (these scripts are 'ready to record' and could be posted verbatim). Post 01 of batch 1 additionally had a fabricated engagement metric ('Posted it. Got 80K views.') — fake social proof with no basis, an S7 anti-gaming violation. Rewrote all pre-launch-appropriate CTAs (batch-1 posts 1-12; batch-2 posts 1-7, 10-12) to 'join the waitlist' framing, removed the fabricated metric, removed the #AppStore hashtag, and added a PRE-LAUNCH NOTE banner to both files. Deliberately left batch-2 posts 08-09 untouched — they are explicit free-to-Pro conversion content already gated to 'Week 5-6+' (post-launch, once a live free tier exists) by the file's own usage notes, so the live-app framing there is correct, not a bug. Ran an independent adversarial reviewer (maker≠checker, fresh context) on the diff: verdict REQUEST_CHANGES on first pass (missed the #AppStore hashtag on batch-1 Post 12, a live-App-Store signal that survived the CTA rewrite) — fixed, plus tightened one redundant line the reviewer flagged as awkward (non-blocking). The reviewer also flagged a pre-existing, out-of-scope issue for future attention: batch-2 Post 09's 'I made that back from one sponsored post... one brand deal' reads as an unverified personal testimonial/claim that should only be recorded if actually true — deferred (that post isn't due until Week 5-6+) but logged in next_actions. Confirmed the Sam Gutelle (Tubefilter) Gmail draft is still unsent (12 days old now, zero replies) via list_drafts/search_threads; also noticed (but cannot delete — no Gmail delete tool available) a leftover Run-3-era 'Growth Report' Gmail draft addressed to the owner that predates the current S5 dashboard-only reporting rule (no daily-digest/status-report emails) — flagged for the owner to manually delete, not sent, causing no external harm. No new outreach target researched this run (the content-honesty fix was the higher-leverage use of the run's effort); zero new drafts is correct absent a verified target."
    - "Run 9 (2026-07-13): connect-channels open 9 consecutive runs — re-probed env for GROWTH_AGENT_SECRET/PROD_URL/RESEND_API_KEY/KV_REST_API_URL/social tokens (all still absent, unchanged since Run 6). Product-loop commits since Run 8 (12 commits, 8b0b04b..6ad9e69) included two more honesty fixes on the SAME class of defect this agent has been tracking: #461 (paywall) dropped a false 'Premium music library' Pro claim, #470 (App Store listing) dropped a false 'Advanced multi-pass AI detection' Pro-tier claim. Checked whether either overclaim had a growth-content-asset counterpart (the same pattern Run 8 found in the video-script batches) — found a REAL, previously-undetected instance: docs/growth/email-sequences.md (EMAIL 1B and EMAIL 1C, both queued pre-launch emails ready to fire the moment Resend connects) claimed 'AI-synced music, sound effects, and captions' / 'Music, captions, and sound effects — automatically' as delivered free-tier features. Music/SFX generation is confirmed non-functional in v1 (no bundled audio assets; the mix path is unreachable — the same fact post-batch-2.md's own usage notes already document and #461/#470 just re-confirmed in the app/store surfaces). Rewrote both bullets to 'captions and smooth transitions' (matching press-kit.md's own accurate phrasing) and added an explicit 'No music/SFX in v1' line to the file's Product-facts guardrail block so a future edit doesn't reintroduce the same claim. Independent adversarial reviewer (maker≠checker, fresh context): verdict APPROVE — confirmed no residual music/SFX claim anywhere in the diff or repo-wide grep, confirmed CTA scoping (Sequences 1/3-5 correctly don't imply pre-launch App Store availability; Sequence 2 is explicitly gated to a manual post-launch trigger), confirmed no fabricated social proof."
    - "Run 9 (2026-07-13), second deliverable: built the Content-First Demand Validation kit that Run 8 deferred (docs/growth/DEMAND_VALIDATION_PLAYBOOK.md existed but was never executed) — docs/growth/DEMAND_VALIDATION_KIT.md (hero-feature pick: raw-footage-in / finished-highlight-out, grounded in the ALREADY-corroborated demand_signal theme 1, not a new guess; 15 original hook variations; a demo shot list; reaction/audio direction; a volume + signal-reading plan) plus docs/growth/demand-validation-demo.html (a self-contained, brand-token-accurate, fake-data 3-screen phone-frame mockup for the owner to screen-record — explicitly labeled a content prop, not the real app, per FACTORY_STANDARD §6b's design bar). Independent adversarial reviewer (same pass): verdict APPROVE — checked honesty, CTA scoping, no fabricated metrics/social proof, hook originality (no verbatim viral-sound lift), on-brand design (real brand-kit.md tokens, not generic-AI slop), and fidelity to the playbook's own A-D structure. Zero posts filmed/posted this run — that's the correct, honest state (owner action, not fabricated as done)."
    - "Run 10 (2026-07-15): connect-channels open 10 consecutive runs — re-probed env for GROWTH_AGENT_SECRET/PROD_URL/RESEND_API_KEY/KV_REST_API_URL/social tokens (all still absent, unchanged since Run 6). GTM_SCORECARD.md (as_of 2026-07-14, an independent Auditor artifact this agent never writes) had regressed ship_gate_met to false over a false '7 kinetic caption styles' claim in docs/content/post-batch-1.md + a re-echo in last run's DEMAND_VALIDATION_KIT.md:16 — checked both files this run and found the PRODUCT loop had already fixed both (commit 3bfd330/#493, landing ~3h after the GTM re-grade, plus 1e00ca7/#494 reconciling the related BUSINESS_CASE S9 ARR-attribution nit the same scorecard flagged); repo-wide grep for any residual '7 kinetic'/'7 caption styles' claim = 0. No action needed from this agent — the scorecard just hasn't been re-graded since the fix landed; noted here so a future run doesn't re-fix an already-fixed defect. THIS RUN'S REAL DELIVERABLE: FACTORY_STANDARD S44 Layer-B (Browserbase live-prod browser access) landed in the product factory since Run 9 (#500) and is present in this agent's env — used it for the first time to run a genuine live probe of https://highlightmagic.app instead of the local-sandbox-only checks Runs 1-9 were limited to. Sanity-verified the Browserbase session itself works (loaded https://example.com -> HTTP 200) before testing the target, so the negative result is trustworthy, not a broken harness. Result: net::ERR_TUNNEL_CONNECTION_FAILED on both https and http from the remote browser, corroborated by this run's local sandbox proxy also 502'ing on CONNECT to the same host and a local DNS resolve4 returning ENOTFOUND — three independent signals across two different network paths, all agreeing the domain does not currently resolve/connect. This reframes the site-gate blocker: it is not just 'set SITE_GATE_PASSWORD in Vercel' (Runs 1-9's framing) but 'first confirm highlightmagic.app is actually registered and pointed at the Vercel deployment (or share a working *.vercel.app fallback URL)' — a materially more specific, actionable owner ask than any prior run had evidence for. Updated PENDING_OPS.md's site-gate item accordingly. Bounded WebSearch this run (HighlightMagic-specific footprint + general AI-highlight-editor complaints) found nothing new — demand_signal stands unchanged from Run 7's restructure, correctly not re-churned. Sam Gutelle draft reconfirmed still unsent (now 16 days old, zero replies); also confirmed via list_drafts that the PENDING_OPS cleanup item undercounted the leftover pre-policy Gmail drafts — it names one ('HighlightMagic Growth — 2026-06-29') but list_drafts shows six pre-existing stale drafts (3 Growth Agent reports from Runs 1-3, 1 quality-grade digest, 2 unlabeled 'daily digest' entries from before the Growth Agent even started) — corrected the PENDING_OPS item to reflect the real count; this agent still has no delete capability (Gmail tool is create_draft-only)."
    - "Run 7 (2026-07-09): connect-channels open 7 consecutive runs — re-probed env for GROWTH_AGENT_SECRET/PROD_URL/RESEND_API_KEY/KV_REST_API_URL/social tokens (all absent, unchanged) and additionally attempted a direct curl to https://highlightmagic.app as extra diligence — the outbound proxy returned a 502 (DNS/network, not evidence the site is up or down); stayed fail-closed (site_gate_up: false unchanged). GTM_STANDARD.md changed materially since Run 6 (#367/#370/#371, landed after Run 6's commit): the demand_signal block gained a mandated schema (overall_strength, sources_covered[]/sources_unconnected[], per-theme label/strength/cited_count/quote/url/product_solves, steers_opened[]) — restructured this run to match it, preserving every existing citation unchanged (no new fabricated data; a living-artifact consistency fix, not new research). Evaluated the new S10 'demand-driven auto-steer' mechanism against the restructured themes: 2 of 4 numerically clear the corroboration bar (>=3 cited posts, >=2 sources) but both map to fit the product/pricing ALREADY has (auto-detect+export core loop; flat non-credit pricing) — correctly opened zero steers rather than steer toward already-built decisions. Corrected outreach.drafted_7d from 1 to 0: the Sam Gutelle draft (created 2026-06-29) is now 10 days old, outside the trailing 7-day window — a real metric-accuracy fix (the draft itself is still open/unsent, tracked in next_actions, not forgotten). Bounded WebSearch found no new HighlightMagic-specific footprint (expected, pre-launch) and no verified new outreach target; surfaced two real but tangential trend items (X's new iOS in-app video editor, 2026-07-07; Apple Creator Studio's Final Cut Pro 'Edit Detection'/'Auto Mask', 2026-06-30) — correctly judged NEITHER as a direct competitor to HighlightMagic's mobile one-tap auto-highlight niche (manual in-app editor vs. Mac-only pro NLE, respectively) and did not force a competitive-landscape addendum for weak-relevance news. GTM_SCORECARD.md is STILL as_of 2026-06-30 (bootstrap grade) — 3+ runs and ~9 days since Run 4's #208 fix, never re-graded; flagging this plainly as a stale-audit signal worth the owner's attention (not this agent's file to write, per maker!=checker, but a scorecard that never re-runs stops being a useful ship gate). Sam Gutelle draft reconfirmed still unsent, zero replies."
    - "Run 11 (2026-07-17): connect-channels open 11 consecutive runs — re-probed env (all still absent, unchanged since Run 6). Re-ran the Run 10 Browserbase live-prod probe (sanity-checked against example.com first): https://highlightmagic.app and http://highlightmagic.app both still net::ERR_TUNNEL_CONNECTION_FAILED, an exact repeat of Run 10's result — a second independent confirmation, not new information; local curl/DNS reproduced the same 502/ENOTFOUND. GTM_SCORECARD.md (as_of 2026-07-14) and QUALITY_SCORECARD.md (as_of 2026-07-15) both unchanged since Run 10 saw them — 3 days / 1 run, not yet a staleness signal worth flagging (the bar is ~9 days/3+ runs). REAL DELIVERABLE THIS RUN: closed part of a genuine, named evidence-quality gap — GTM_SCORECARD's roadmap_steer_justification evidence (as_of 2026-07-14) explicitly noted 'the demand corpus underpinning the no-steer call is still entirely aggregator/blog citations... the evidence base is second-hand.' Runs 5-10 hit HTTP 403 on the App Store review-LISTING page and Trustpilot/Reddit and never found a way around it. This run tried a DIFFERENT, unblocked endpoint: Apple's public App Store customer-review RSS/JSON feed (itunes.apple.com/us/rss/customerreviews/id=<appId>) — fetched cleanly via WebFetch for CapCut and Eklipse.gg (two of the four already-cited competitors). Verified the extraction wasn't a WebFetch-summarizer hallucination by re-fetching two Eklipse entries and confirming the RAW JSON matched (exact author/date/quote) before citing anything. Added 3 new PRIMARY, dated (2026-07-03 to 2026-07-15, i.e. within the last 2 weeks — far more current than the 'dated 2026' aggregator citations) examples to demand_signal theme 3 (pricing/trust friction), all directly corroborating the existing theme (Eklipse 'Overcharging' / refund refusal; Eklipse premium-paywall frustration; CapCut free-tier-treatment complaint). No BUSINESS_CASE number changed (qualitative evidence-quality upgrade only, same theme, same conclusion — just better-sourced) and no new steer opened (theme 3's product-fit is still the ALREADY-built flat-pricing decision, per Run 7's steers_opened_note, which still holds). Corrected PENDING_OPS's stale Gmail-draft cleanup count: list_drafts shows NINE stale drafts, not six (Run 10's count) — Run 10 undercounted the unlabeled 'daily digest' entries (5 exist, spanning 2026-06-24 to 06-27, not 2). Sam Gutelle draft reconfirmed still unsent (18 days old, python3-verified), zero replies. Bounded WebSearch for new HighlightMagic-specific footprint and general AI-video-editor complaints found nothing new — no new theme forced."
    - "Run 12 (2026-07-19): connect-channels open 12 consecutive runs — re-probed env (GROWTH_AGENT_SECRET/PROD_URL/RESEND_API_KEY/KV_REST_API_URL/social tokens all still absent, unchanged since Run 6; only BROWSERBASE_* present). Did NOT re-run the paid Browserbase live-prod probe this run — Runs 10 and 11 already independently confirmed net::ERR_TUNNEL_CONNECTION_FAILED with zero signal anything changed, so a third identical paid-browser run would be redundant cost, not diligence (per the same anti-churn discipline Run 6 applied to demand-signal re-derivation). Instead ran the cheap local check (node dns.resolve4 -> ENOTFOUND; curl -> CONNECT tunnel failed/502) — identical to every prior run; domain still unreachable, no owner action detected. GTM_SCORECARD.md is STILL as_of 2026-07-14 (unchanged for a 3rd consecutive run, 5 days now) despite the underlying defect it cited (post-batch-1.md's false '7 kinetic caption styles' claim) being independently reconfirmed FIXED in-repo by both Run 10 and this run (repo-wide grep for '7 kinetic'/'kinetic caption' + manual read of post-batch-1.md:252,261 and DEMAND_VALIDATION_KIT.md:16 — both correctly say '4 animated caption styles' / '4 animated styles') — this is now a genuine 3-run/5-day re-grade lag worth flagging plainly (not a new escalation, just the incremented fact; not this agent's file to write). QUALITY_SCORECARD.md also unchanged (as_of 2026-07-15, overall B, ship_gate_met false — store_readiness C persists an 8th+ cycle on the owner-only Xcode/Mac gap). REAL DELIVERABLE THIS RUN: extended Run 11's App Store RSS primary-source technique to 2 more competitors (OpusClip id6743615403, Vizard id6748490660; also tried FullCourt.ai id1534211457 but its newest review is ~5 months old with no new pattern, correctly not added). Found a new, current (2026-07-12) OpusClip 1-star review reporting a paid watermark-removal purchase that produced a broken export and burned credits with no refund path, and a genuinely new sub-pattern from 3 independent Vizard reviews (2026-04-07 to 2026-06-29): the mobile app's advertised editing features silently don't work on-device, real functionality is web-only — a trust/delivery-gap complaint, added to theme 3 (not invented as a new theme, and correctly NOT claimed to individually clear the S10 auto-steer bar since it has only one independent source). Verified both new citations against raw JSON (exact match, no paraphrase) before adding. No BUSINESS_CASE number changed (qualitative only) and no new steer opened. Sam Gutelle draft reconfirmed still unsent (20 days old), zero replies; the 9 stale pre-policy Gmail drafts are all still present, unchanged. Bounded WebSearch for a HighlightMagic-specific footprint and a named AI-clip-tool-beat journalist found nothing new — same dead end as 6 prior runs, correctly zero new outreach drafts."
    - "Run 13 (2026-07-23): connect-channels open 13 consecutive runs — re-probed env (GROWTH_AGENT_SECRET/PROD_URL/RESEND_API_KEY/KV_REST_API_URL/social tokens all still absent, unchanged since Run 6; only BROWSERBASE_* present). Did NOT re-run the paid Browserbase live-prod probe — no signal since Run 12 to expect a different result; the cheap local check (dns.resolve4 -> ENOTFOUND; curl -> CONNECT tunnel failed/502) reproduced the identical result. THE GENUINE NEW FACT THIS RUN: the independent GTM Auditor DID re-grade since Run 12 (GTM_SCORECARD.md as_of 2026-07-22, Audit Run 4, commit b5d3765) — overall A, ship_gate_met RECOVERED false->true. This closes the exact 3-run/5-day staleness gap Run 12 flagged in next_actions: the auditor independently reconfirmed the '7 kinetic caption styles' fix, upgraded artifact_freshness C->A and compliance B->A on that fix, plus business_case_honesty A->A+ and roadmap_steer_justification A->A+ on unrelated resolved gaps. Its own remaining top_gap is the SAME as_of-staleness nit this agent has been carrying (GROWTH_STATUS as_of was 3 days stale at grading time, now current again with this run's bump) — low severity, not a fabrication, addressed by this run's as_of stamp. QUALITY_SCORECARD.md (the PRODUCT scorecard, which actually gates launch_readiness) remains unchanged: as_of 2026-07-15, overall B, ship_gate_met false, store_readiness C persisting a 9th+ cycle on the owner-only Xcode/Mac gap — GTM_SCORECARD improving does NOT unlock outbound marketing on its own (GTM_STANDARD S13 Gate 1 keys off the product scorecard). Re-verified Gmail state: the Sam Gutelle/Tubefilter draft is still present, unsent, unedited (list_drafts), now 24 days old; search_threads for tubefilter/sam@tubefilter.com still returns zero replies; all 9 pre-policy stale drafts still present, unchanged (10 total drafts, matching Run 11's corrected count). Bounded WebSearch for a HighlightMagic-specific footprint and a named AI-clip-tool-beat journalist again found nothing — 7 consecutive dead-end runs on outreach-target search, correctly zero new drafts. Deliberately did NOT extend the App Store RSS technique to a 5th competitor (Descript, flagged untried in Run 12's next_actions): theme 3 already clears the corroboration bar several times over (4 sources / 8 citations) and Run 12's own learning says the technique only ever surfaces theme-3-shaped evidence — a 5th same-shaped citation is padding, not a genuine deliverable, so correctly skipped. No BUSINESS_CASE number changed (nothing new to model) and no roadmap/VISION steer opened (no new high-confidence, causally revenue-linked data this run). Ran an independent adversarial reviewer subagent (maker≠checker, fresh context) on the full diff: verdict REQUEST_CHANGES on one issue — an earlier draft of this same learnings entry referenced 'the reviewer's findings' in past tense before the review had actually run; fixed by writing the real verdict here instead of a placeholder. Every other check passed (scorecard claims verified byte-for-byte against GTM_SCORECARD.md/QUALITY_SCORECARD.md, date arithmetic re-verified, YAML re-validated, no scope creep into ROADMAP/VISION/BUSINESS_CASE/GTM_SCORECARD, anti-churn reasoning on skipping the 5th RSS competitor and the 4th Browserbase probe judged sound)."
  next_actions:
    - "CIRCUIT BREAKER — 13 runs open: owner must connect Resend (docs/growth/CONNECT.md Step 1, ~5 min, free) + resolve the domain/DNS gap below to unlock execute mode. No new action needed from this agent until one of those changes — see PENDING_OPS.md gtm-connect-email / site-gate."
    - "URGENT (unchanged since Run 10; RE-CONFIRMED this run via the cheap local DNS/curl check, not a fresh Browserbase probe — identical result, no reason to expect a change): confirm highlightmagic.app is actually registered and its DNS points at the Vercel deployment (or share a working *.vercel.app fallback URL). This is upstream of SITE_GATE_PASSWORD: the site gate cannot be verified up if the domain itself isn't resolving."
    - "Owner: review + send the Sam Gutelle / Tubefilter Gmail draft (search inbox drafts for 'Highlight Magic (iOS, pre-launch)'). Add full name, business address, one specific article reference first — still unsent as of 2026-07-23 (24 days old, python3-verified)."
    - "GTM_SCORECARD.md WAS re-graded since Run 12 (as_of 2026-07-22, Audit Run 4): overall A, ship_gate_met RECOVERED false->true — the 3-run/5-day staleness this agent flagged is now resolved, no further action needed there. Its one remaining top_gap (GROWTH_STATUS as_of freshness) is addressed by this run's as_of stamp."
    - "Owner: film + post the demand-validation content kit (docs/growth/DEMAND_VALIDATION_KIT.md + demand-validation-demo.html, built Run 9) — screen-record the 3-screen prop, pick 2-3 hooks to start with, post across TikTok/Reels/Shorts, and report back the comment text (not just view counts) so intent-comment rate can be read next run. Still not filmed as of this run."
    - "Owner: NINE leftover pre-policy Gmail drafts are sitting unsent (reconfirmed unchanged this run via list_drafts): 3 Growth Agent status-report emails (Runs 1-3, 2026-06-27 to 2026-06-29), 1 quality-grade digest (2026-06-29), and 5 unlabeled 'daily digest' entries (2026-06-24 x2, 06-25, 06-26, 06-27). All predate the current GTM_STANDARD S5 dashboard-only reporting rule and are unsent/harmless — safe to delete manually; this agent has no Gmail delete tool."
    - "Owner: create a plausible.io account for highlightmagic.app (the code side, #360, already shipped) — this is now the ONLY remaining step for in_app_analytics besides GROWTH_AGENT_SECRET."
    - "If owner connects Resend: queue welcome email to existing waitlist; pull real list_size from Resend Audience."
    - "If owner provisions Vercel KV + sets GROWTH_AGENT_SECRET: pull real waitlist_signups_total from /api/growth/stats instead of reading code state."
    - "Product-factory build gap (not an owner action): even after the Plausible account exists, getGrowthMetrics() has no read path back to Plausible's Stats API, so visitors_7d/visitor_to_waitlist_rate stay null. Worth a future E6d extension once analytics is otherwise connected — flagging as a RECOMMEND, not a roadmap steer (no revenue data attached, just a wiring gap)."
    - "Once the experiment engine (ROADMAP E8) ships AND a channel connects: run exp-landing-h1-benefit-vs-outcome (already designed, see experiments[]) rather than designing a new one."
    - "Before docs/content/post-batch-2.md Post 09 is ever recorded (gated to Week 5-6+, post-launch): its script line 'I made that back from one sponsored post... one brand deal' reads as a specific personal-anecdote claim with no stated basis — the owner should only say it if it actually happened, or rewrite it as a generic illustrative example before filming, per GTM_STANDARD S7 (no invented social proof). Still deferred — the post isn't due yet."
    - "The App Store customer-review RSS feed covers 4 competitors (Eklipse, CapCut, OpusClip, Vizard), all evidence matching theme 3's frame (trust/reliability/delivery-gap), never themes 1/2/4 — Run 13 deliberately declined to extend it to a 5th (Descript) since theme 3 already clears the corroboration bar several times over; a future run should only extend it further if there's a specific reason to expect NEW-theme evidence, not just another theme-3 data point. Reddit/Trustpilot/the App Store review-LISTING page (a different endpoint than the RSS feed) remain 403'd to WebFetch — not solved."
  owner_blockers:
    - "site-domain-dns (urgent, unchanged since Run 10; reconfirmed Run 11 via a second independent Browserbase probe and Run 12 via a cheap local DNS/curl check — all agree): highlightmagic.app does not resolve/connect — see site_gate_up above. Verify domain registration + DNS/alias config in Vercel before the site gate can ever be confirmed up. This is still the FIRST thing to check, ahead of SITE_GATE_PASSWORD itself."
    - "gtm-connect-email: connect Resend (docs/growth/CONNECT.md Step 1) to unlock transactional + lifecycle email"
    - "gtm-connect-datastore: provision Vercel KV (CONNECT.md Step 3) so waitlist signups persist + /api/growth/stats has real data"
    - "gtm-connect-analytics: script is now wired (#360) — remaining ask is create the plausible.io account for highlightmagic.app AND set GROWTH_AGENT_SECRET so this agent can pull real funnel numbers instead of 0/null"
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
