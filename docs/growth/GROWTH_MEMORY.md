# Growth Memory — HighlightMagic

Dated log of what the Growth Agent tried, what worked, what didn't, and WHY.
Distilled lessons carried forward so each run is smarter than the last.
**Read FIRST each run. Append at the end of each run.**

---

## 2026-06-27 — Run 1 (Growth Agent bootstrap)

### State found
- Phase: pre_launch
- Engine built: false — E6 not started; waitlist route stubs to console.log only
- Channels connected: none
- GROWTH_MEMORY.md: did not exist (created this run)
- docs/growth/CONNECT.md: did not exist (created this run)
- Email sequence drafts: did not exist (created this run)

### Prior build history (Runs 1–26, from ROADMAP)
E1–E5 all merged and verified:
- E1: Landing page + waitlist stub (PR #42)
- E2: Brand kit, color/type/voice/logo system (PR #46)
- E3: ASO package — title/subtitle/keywords/screenshots (PR #47)
- E4: Content calendar + 12-post video script batch (PR #48)
- E5: Analytics + funnel tracking wired to landing page (PR #49)

E6 (growth execution engine): not started. Owner blockers gate all external growth action.

### What I built this run
- **docs/growth/GROWTH_MEMORY.md** (this file) — required by spec, was missing
- **docs/growth/email-sequences.md** — full 7-email lifecycle: welcome → pre-launch nurture → launch → activation → conversion → win-back. Reviewed adversarially before merge; 6 blockers fixed (watermark contradiction, invented Pro benefit, unfilled placeholders, misleading free-tier framing).
- **docs/growth/CONNECT.md** — owner runbook: exactly which env vars / OAuth connections to set per channel to switch from prepare to execute mode (E6e)

### Learnings
- Biggest PREPARE mode gap was the email sequence — entirely absent; created this run. It's the highest-ROI pre-built asset because it directly drives waitlist→install and free→Pro conversion when channels connect.
- CONNECT.md (E6e) was missing — without it, a motivated owner has no clear path to connecting channels. Created this run.
- The adversarial review caught 6 real issues in the email drafts, most importantly: free-tier watermark was misrepresented as absent (contradicts actual product spec: free exports have a watermark; Pro removes it). Never describe a paid benefit as included in free.
- No external channels connected; all funnel metrics correctly 0/null.
- Owner is blocked on: spend-caps (urgent — backend is live), vercel-env-keys, connect-channels, server-quota-infra.
- Business case: $100K ARR achievable but not in year 1. Highest-return levers: (1) price Pro at $14.99 vs $9.99, (2) add $149.99/yr annual tier, (3) reduce frame-scoring COGS ($0.12/export is the dominant line).

### Dead ends / what NOT to repeat
- None new this run (first Growth Agent run)
- Future runs: do NOT re-draft ASO or content-calendar without a clear gap — those assets are solid. Focus on E6 build readiness and channel connections.

### Circuit-breaker note
The `connect-channels` owner blocker has been open since engine launch. If it is still open in 3+ consecutive runs, escalate prominently in the report and propose the single easiest first connection (Resend for email — free tier, 5-minute setup).

### Next run priorities
1. Check if owner has connected any channels (Resend, Vercel KV) — if yes, switch to execute mode and pull real funnel numbers
2. Check if product loop has built E6a (waitlist datastore) or E6b (email send) — if yes, engine_built flips toward true
3. If still no connections and no E6 build: draft post-batch-2.md (12 more video scripts, different niches) as the next PREPARE mode asset
4. Keep CIRCUIT BREAKER in mind: if connect-channels is still open at Run 3, escalate in report

---

## 2026-06-28 — Run 2

### State found
- Phase: pre_launch (unchanged)
- Engine built: true (code confirmed — E6a–E6e all present: waitlist-store.ts, metrics.ts, email/social routes, growth/stats route, CONNECT.md)
- Channels connected: none (no Resend, no Vercel KV, no GROWTH_AGENT_SECRET — stats route returns 503)
- site_gate_up: false — HARD BLOCK on execute mode (unchanged from Run 1)
- All funnel metrics: 0/null (correct — no connected source)

### What I built this run
- **docs/content/post-batch-2.md** — 12 new video scripts (gaming, wedding, fitness transformation, pet compilation, family events, car meets, dance/performance, free-vs-Pro conversion x2, food/cooking, soccer skills, extreme/adventure sports)
- Adversarial review (independent subagent) found 3 real issues, all fixed before commit:
  1. Removed "no sign-up" end-card claim from Post 01 — unverified feature claim not grounded in product spec
  2. Replaced Post 12 concert/festival with extreme/adventure sports — concert overlapped Batch 1
  3. Added energy-matched music recording-time verification note — Batch 1 establishes this as a product feature, but owner should verify before recording

### Learnings
- The adversarial review catch rate was solid: ad hoc feature claims ("no sign-up") slip in easily — always verify onboarding flow specifics against product spec. Batch overlap is easy to miss when writing 12 posts quickly — always diff against existing batches.
- GROWTH_AGENT_SECRET not set → /api/growth/stats returns 503. Owner must set this to enable real funnel data pull. Not a blocker in PREPARE mode, but needed for EXECUTE mode real-data pulls.
- Git environment note: initial working state was detached HEAD at PR #152 / origin/main tip; local main branch was behind. Resolved by resetting to origin/main. Future runs: always check and reset local main to origin/main before working.
- No channels connected; PREPARE mode correct. All metrics 0/null (honest).

### Dead ends / what NOT to repeat
- Do NOT add "no sign-up" or similar onboarding-flow claims to scripts without verifying the actual app
- Do NOT add another concert/festival post — covered in Batch 1
- Batch 3 (if needed): avoid all Batch 1+2 niches (basketball, travel vlog, workout/sports, music sync, concert, gaming, wedding, fitness transformation, pets, family events, car meets, dance, free-vs-Pro conversion, food, soccer, extreme sports)

### Circuit-breaker status
- **Run 2 of 3 before escalation.** At Run 3 (2026-06-29): if connect-channels still open, ESCALATE prominently. Single easiest connection = Resend (free tier, no credit card needed, ~5-min setup, unlocks the entire email lifecycle from waitlist welcome onward per CONNECT.md).

### Next run priorities (Run 3)
1. Check for channel connections — if Resend connected, pull real list_size + queue welcome email to existing waitlist
2. CIRCUIT BREAKER: if still no connections at Run 3, escalate with specific Resend setup instruction
3. PREPARE asset: press kit / media one-pager (docs/press-kit.md) — missing, would enable PR outreach at launch with zero owner-channel dependency; or landing page H1 copy variants

---

## 2026-06-29 — Run 3

### State found
- Phase: pre_launch (unchanged)
- Engine built: true (unchanged)
- Channels connected: none (CIRCUIT BREAKER TRIGGERED — 3 consecutive runs with no connection)
- site_gate_up: false (unchanged — HARD BLOCK on execute mode)
- Quality scorecard: B overall, ship_gate_met: false (correctness_reliability C, store_readiness C)
- All funnel metrics: 0/null (correct — no connected source)

### What I built this run
- **docs/press-kit.md** — media one-pager enabling journalist/press outreach at launch. Adversarial review caught 8 real issues, all fixed before commit:
  1. "Unlimited exports" contradicted the 50-export/day ceiling in the same sentence — FTC risk; removed "Unlimited," replaced with "No monthly export quota"
  2. "Free tier offers full feature access" — factually false (watermark + quota ARE feature restrictions); removed
  3. "One-tap share to TikTok/Reels/Shorts" — implies native deep-link integration not confirmed; changed to "share via iOS share sheet"
  4. "Clone your voice for narration" — biometric data (voice samples) compliance complexity + pre-launch confirmation gap; removed from press kit
  5. "AI analyzes every frame" — inaccurate (max 120 frames sampled, not every frame); changed to "samples and scores frames"
  6. Website link "highlightmagic.app" — may be gated by SITE_GATE_PASSWORD; changed to highlightmagic.app/landing (public)
  7. Internal repo paths (docs/brand-kit.md, docs/aso-package.md) — not accessible to press; changed to "available on request"
  8. Competitor pricing from aggregator sites — stale risk; added "verify directly with each vendor before publishing"

- **Gmail draft: Sam Gutelle (Tubefilter)** — 1 pre-launch pitch email created as Gmail draft for owner to review + send. Independent adversarial review flagged: missing physical address (CAN-SPAM), opt-out language needed, personalization gap (no specific article reference). All flagged in draft for owner to complete before sending.

### Learnings
- ADVERSARIAL REVIEW CATCH RATE IS HIGH: The press kit had 8 real issues despite being written carefully. The pattern is that honesty-adjacent traps are the hardest to catch yourself: "full feature access" sounded reasonable because we provide all AI features in the free tier (before hitting the cap), but the watermark + quota ARE restrictions, and "full feature access" is straightforwardly false. Always run the checker.
- "UNLIMITED" and a hard cap cannot coexist in the same sentence without being deceptive. The 50-export/day anti-abuse ceiling makes "unlimited" a misrepresentation. Fix: "No monthly export quota" — accurate and still differentiated from free tier's 5/month cap.
- "Every frame" is a common exaggeration. The product scores up to 120 frames per video — a sample, not every frame. Be precise.
- Voice cloning has a GDPR/biometric compliance surface (voice samples = biometric data under GDPR Article 9, BIPA in Illinois). Pre-launch press kit is not the place for this claim without a confirmed compliant flow.
- CAN-SPAM applies to promotional emails even when sent to journalists. A physical postal address is a legal requirement. For a solo founder, a virtual office or registered agent address is the right solution — flag this prominently in outreach drafts.
- Strategic outreach research found 2 real targets (Ariel Michaeli / Appfigures, Sam Gutelle / Tubefilter). Drafted for Sam Gutelle because his beat (creator tools + creator economy) is the more precise fit. Ariel Michaeli's audience (app market professionals, not creators) is better targeted post-launch with real download data.

### Dead ends / what NOT to repeat
- Do NOT claim "every frame" is analyzed — product samples up to 120 frames
- Do NOT use "unlimited" with a hard ceiling in the same sentence
- Do NOT describe voice cloning as a press-kit feature without confirming the GDPR/consent flow
- Do NOT reference internal repo file paths (docs/*.md) in external-facing media documents
- Do NOT link to highlightmagic.app base domain in pre-launch materials — may be gated
- Ariel Michaeli (This Week in Apps): better for post-launch with real download data; his audience is app-market professionals, not creators. Do NOT draft pre-launch outreach to him.

### Circuit-breaker status
- **TRIGGERED at Run 3.** connect-channels has been open for 3 consecutive runs. The circuit breaker has fired — this is now the prominent blocker.
- The single easiest unlock: Resend (email provider, free tier, ~5 min setup per CONNECT.md)
- At Run 4: if connect-channels still open, do not repeat the same escalation — instead note "blocked same action for N runs, only action available is Resend per CONNECT.md" and keep PREPARE mode work short (one focused asset only).

### Next run priorities (Run 4)
1. Check for channel connections (Resend, Vercel KV, GROWTH_AGENT_SECRET) — if any connected, pull real data and switch to execute mode
2. Check whether Sam Gutelle draft was sent (owner-reported) and update outreach.owner_sent_7d accordingly
3. If still no connections: short PREPARE asset — landing page H1 copy variants (A/B test copy design staged for when the experiments engine is built)
4. Do NOT build another video script batch or repeat press kit work — both are done

---

## 2026-07-01 — Run 4

### State found
- Phase: pre_launch (unchanged); engine_built: true (unchanged)
- Channels connected: none — **4th consecutive run** with connect-channels open (circuit breaker fired at Run 3, still unresolved; owner has not acted on Resend/KV/site-gate between Run 3 and Run 4)
- site_gate_up: false (unchanged — HARD BLOCK on execute mode)
- New this run: an independent **GTM Auditor** routine had bootstrapped (2026-06-30) and graded the factory overall A but `ship_gate_met: false` — `self_validation_honesty` graded **B** (ship-critical), filed as GitHub issue #208. This was the run's top-priority signal per GTM_STANDARD §8 (a ship-critical dimension below A is the highest-priority work, ahead of new PREPARE assets).

### What I built this run
- **Closed the ship-critical audit gap (issue #208):** added a structured `validation:`/`sources:` block to `docs/growth/GROWTH_STATUS.md` enumerating all 9 real external dependencies (in_app_analytics/Plausible, the internal `/api/growth/stats` pull, billing/StoreKit, email/Resend, datastore/Vercel KV, and the 4 social channels), each independently verified against the actual code this run (exact `web/src/lib/validation-manifest.ts` line numbers; grep-confirmed the Plausible `<script>` tag is absent from `web/src/app/layout.tsx`) and correctly marked `unavailable`. This is the missing machine-readable self-validation contract the auditor named — nothing was fabricated, it closes a structural gap.
- **Split `PENDING_OPS.md`'s generic `connect-channels` item** into `gtm-connect-email`, `gtm-connect-datastore`, `gtm-connect-analytics`, `gtm-connect-social` per the `gtm-connect-<source>` naming GTM_STANDARD §4 mandates. Did NOT duplicate the pre-existing `storekit-products` item for the billing source — the validation block's `billing` entry points its `owner_action` at that existing id instead.
- **Fixed one artifact-freshness nit** the auditor also flagged (low severity): `docs/aso-package.md` screenshot-caption table said "Unlimited exports" without the "monthly" qualifier used everywhere else in the same doc (line 83) — one-word fix for consistency.
- **Designed (did not run) the first landing-page experiment**: H1 copy variant (benefit/time-to-value framing vs. the live aspirational "Turn Your Best Moments Into Viral Highlights") with a real two-proportion power calc (~4420 total visitors to detect a 5%→7% lift at 80% power) — recorded in `experiments[]` as `status: designed` since neither the experiment engine (ROADMAP E8) nor any traffic exists yet. This is exactly what ANALYSIS_PLAYBOOK step 4 prescribes when the engine isn't built: record the fully-designed test rather than fabricate a result.
- Ran an independent adversarial reviewer subagent (maker≠checker) on all of the above before committing — verdict APPROVE, zero blocking issues; it independently re-verified every line-number citation and recomputed the power calc.

### Learnings
- **The independent GTM Auditor is now live and is a real, high-value signal** — its first grade (A overall, gate not met) named a genuinely missing structural piece (the validation/sources block), not a fabrication. Read `docs/growth/GTM_SCORECARD.md` + `docs/growth/GTM_AUDIT_MEMORY.md` FIRST every run going forward, alongside GROWTH_MEMORY — a ship-critical dimension below A/A+ is now the run's top priority, ahead of new PREPARE assets, per GTM_STANDARD §8.
- Self-validation honesty was already substantively correct (0/null metrics, no claimed-but-unconnected channel) — the gap was purely the missing MACHINE-READABLE contract, not a dishonesty problem. Worth distinguishing: "honest but structurally incomplete" still caps the grade below A.
- Circuit-breaker discipline held: with connect-channels open a 4th consecutive run and nothing new to say, this run did NOT re-write the same escalation prose — it named the fact plainly (4 runs, no new owner action, no new ask) and spent the run's effort on the two above concrete, real deliverables instead of padding.
- No new strategic outreach target was researched this run (the Sam Gutelle draft from Run 3 is still awaiting the owner's send) — zero new outreach drafts is the correct, non-forced outcome per OUTREACH.md.

### Dead ends / what NOT to repeat
- Do NOT re-draft the H1 experiment design again — it now exists in `GROWTH_STATUS.experiments[]`; when E8 + traffic land, RUN it, don't redesign it.
- Do NOT re-escalate connect-channels with new prose when nothing has changed — state the run count plainly and move on to other value-bar-clearing work (this run's approach).

### Circuit-breaker status
- **Still open at Run 4 (4 consecutive runs).** No owner action taken between Run 3 and Run 4. The ask is unchanged: connect Resend per `docs/growth/CONNECT.md` Step 1 (~5 min, free, no credit card) — the single highest-leverage unlock. Next run: if still unconnected, do not add new escalation language; just note the incremented run count and keep any PREPARE work short.

### Next run priorities (Run 5)
1. Check for channel connections + whether `docs/growth/GTM_SCORECARD.md` was re-graded (did `self_validation_honesty` move to A? diff every dimension vs the Run-1 audit table in `GTM_AUDIT_MEMORY.md`)
2. Check whether the Sam Gutelle draft was sent (owner-reported) and update `outreach.owner_sent_7d`
3. If a ship-critical GTM dimension is still below A, that stays top priority over new PREPARE assets
4. If still no channel connections and the scorecard is clean: consider a second designed experiment (e.g. paywall-copy variant) or fresh outreach research — but only if a genuinely new, non-duplicative opportunity exists

---

## 2026-07-03 — Run 5

### State found
- Phase: pre_launch (unchanged); engine_built: true (unchanged)
- Channels connected: none — **5th consecutive run** with connect-channels open. One real change since
  Run 4: `spend-caps` flipped to `status: done` (owner-attested 2026-07-02) in a separate commit (#266)
  — the "🚨 URGENT — DO NOW" prose banner in `PENDING_OPS.md` still read as open/urgent, contradicting
  the YAML's `status: done`; fixed this run (a real living-artifact consistency bug, not padding).
- `GTM_SCORECARD.md` has NOT been re-graded since Run 1 (as_of 2026-06-30) — still shows the pre-fix
  `self_validation_honesty: B`, even though Run 4 (2026-07-01) added the structured validation/sources
  block the Auditor asked for. Nothing further for the Growth Agent to do here; it's the Auditor's turn.
- Sam Gutelle (Tubefilter) draft from Run 3 is still sitting unsent in Gmail drafts; no reply (confirmed
  via `search_threads` for sam@tubefilter.com — zero results).
- **NEW STANDARD REQUIREMENT FOUND**: `GTM_STANDARD.md` §10 (pre-launch demand validation — mine real
  public pain signal) was added to the canonical standard on 2026-07-02 (commit cfc9207/#261, after
  Run 4). This repo's `GROWTH_STATUS.md` had NO `demand_signal` block yet — a genuine, newly-created gap,
  not a miss by prior runs (the requirement didn't exist when they ran).

### What I built this run
- **`demand_signal` block in `docs/growth/GROWTH_STATUS.md`** (new, per GTM_STANDARD §10): WebSearch
  research (primary platform pages — Reddit, Trustpilot, App Store reviews, a journalist muckrack bio —
  all returned HTTP 403 to WebFetch this run, so citations are 2026-dated review-aggregator articles that
  quote/summarize the underlying reviews) surfaced 4 themes, each with real cited URLs + quotes:
  1. Manual highlight editing is a real, durable 4–6 hr/video time cost (high confidence) — directly
     validates the core JTBD.
  2. Established AI clip tools (Opus Clip, Vizard) are audio/transcript-first and mis-select on
     low-dialogue visual content (gaming/sports) — validates HighlightMagic's frame-based visual-scoring
     architecture, BUT with an important counter-signal: **Eklipse** is an established, dedicated
     gaming-clip AI competitor (1,000+ game titles trained, claims 1M+ streamers) — so this is NOT white
     space; the honest differentiator is multi-vertical breadth (gaming+sports+events+family in one
     iOS-native app), not category exclusivity.
  3. Existing tools carry real, current trust friction (Opus Clip processing failures, CapCut's 1.2★
     Trustpilot + hard-to-cancel billing, Descript's "predatory" credit system) — HighlightMagic's flat
     pricing structurally avoids this pattern, but it's an unproven pre-launch claim, not a guarantee.
  4. The youth-sports-highlight niche is contested (FullCourt.ai, XbotGo, Athlete AI, MOJO Sports already
     exist) — counter-signal against assuming that sub-vertical is uncontested.
  Explicit `disconfirming_notes` + a `limitation` field logging the WebFetch 403s. Labeled throughout as
  a LEADING indicator, never PMF.
- **`docs/BUSINESS_CASE.md` Section 2 addendum** ("Demand-signal addendum, 2026-07-03"): logs the same
  competitive-landscape gap (Eklipse + sports-specific tools missing from the comp table) and the
  core-JTBD validation, qualitatively — **zero numbers changed** (arr_year1/floor_met_year1/as_of in the
  machine-readable summary block untouched; verified by an independent reviewer).
- **Fixed the stale `PENDING_OPS.md` spend-caps banner** (prose said "🚨 URGENT — DO NOW", YAML said
  `status: done` since #266) — a real contradiction, now consistent.
- **Checked for a new strategic-outreach target**: the Eklipse finding suggested a gaming/esports
  journalist angle (Titas Khan — bylines at Dot Esports/Sportskeeda/Dexerto/CharlieIntel/Gfinity per a
  muckrack search hit), but the muckrack bio-page fetch (WebFetch) 403'd, so I could not verify their
  actual beat (tool coverage vs match/tournament reporting) to clear OUTREACH.md's "name the target + why
  + anticipated reply" bar. **Correctly drafted ZERO new outreach** rather than guess — OUTREACH.md is
  explicit that zero is the correct outcome absent verified fit.
- Ran an independent adversarial reviewer subagent (maker≠checker) on the full diff before committing.
  **First pass: REQUEST_CHANGES** — it caught 3 malformed YAML lines (a quoted string followed by
  unquoted trailing text on the same `quote:` line — a genuine syntax bug that would have broken any
  YAML parser, confirmed via `python3 -c "import yaml; ..."`). Fixed all 3 (wrapped the full value in one
  quoted string, converted inner double-quotes to single-quotes). Re-verified with the same parser +
  `node scripts/validate-gtm.mjs` (passes) before committing. The reviewer also spot-verified 9 of 10
  cited URLs (via WebFetch/WebSearch, hitting the same 403s but corroborating via search) and found no
  fabricated citation.

### Learnings
- **Read the canonical GTM_STANDARD.md fresh every run, don't assume it's unchanged** — §10 landed
  between Run 4 and Run 5 and introduced a real, previously-nonexistent required artifact
  (`demand_signal`). A stale mental model of "what the standard requires" would have missed this.
- **WebFetch is heavily blocked by anti-bot protection on review/social platforms** (Reddit, Trustpilot,
  Apple App Store review pages, Muckrack all returned 403 this run) — real evidence is still reachable
  via WebSearch's synthesized summaries (which cite dated, real aggregator-article URLs that in turn
  quote the underlying reviews), but a future run should try alternate access paths (App Store RSS review
  feeds, an official Reddit-friendly endpoint) if it wants PRIMARY platform citations instead of
  secondary aggregator ones.
- **The adversarial reviewer earned its keep again**: a YAML syntax bug (unquoted trailing text after a
  quoted scalar) is exactly the kind of self-review blind spot GTM_STANDARD's maker≠checker rule exists
  to catch — I would not have caught it without an independent parse-and-check pass.
- **Demand-signal counter-signal matters as much as the confirming signal**: the "gaming/visual content
  is underserved" wedge felt strong until I found Eklipse — an established, dedicated competitor with a
  real claimed user base. Reporting that honestly (rather than only citing the confirming Opus Clip/Vizard
  weakness) is what GTM_STANDARD §10 explicitly demands ("flag counter-signal too").
- Circuit breaker discipline held again: 5th consecutive run with connect-channels open, no new
  escalation prose — stated the run count plainly and put the run's effort into the two genuinely new,
  real deliverables above instead.

### Dead ends / what NOT to repeat
- Do NOT re-run the same demand_signal research verbatim next time it's due for a refresh — it's now
  recorded with citations; a future refresh should look for NEW evidence/dates, not re-derive the same 4 themes.
- Do NOT draft outreach to a target whose specific beat/fit can't be verified (the Titas Khan / gaming
  journalist lead is unconfirmed — do not draft to them without independently confirming they cover
  tools/software, not just match/tournament news, via a source WebFetch can actually reach).
- Do NOT write a `quote:` YAML value as `"quoted text" + trailing unquoted text` on one line — wrap the
  ENTIRE value in one pair of quotes (convert inner double-quotes to single-quotes) or use a block scalar.

### Circuit-breaker status
- **Still open at Run 5 (5 consecutive runs).** `spend-caps` closed (owner-attested 2026-07-02) but the
  four `gtm-connect-*` items (email/datastore/analytics/social) plus `site-gate` remain open. The ask is
  unchanged: connect Resend per `docs/growth/CONNECT.md` Step 1 (~5 min, free) is still the single
  highest-leverage unlock. Next run: if still unconnected, do not add new escalation language.

### Next run priorities (Run 6)
1. Check for channel connections — if any connected, pull real data and switch toward execute mode
   (still gated by `site_gate_up` per the marketing maturity gate).
2. Check whether `docs/growth/GTM_SCORECARD.md` was re-graded — did `self_validation_honesty` move to A
   now that the validation block (Run 4) has had two cycles to be picked up by the Auditor?
3. Check whether the Sam Gutelle draft was sent (owner-reported) and update `outreach.owner_sent_7d`.
4. Re-read `GTM_STANDARD.md` in full again (not from memory) — it changed once between Run 4 and Run 5;
   it can change again.
5. If a future run can reach primary review platforms (Reddit/Trustpilot/App Store), deepen the
   `demand_signal` citations with direct quotes instead of aggregator-article summaries.

---

## 2026-07-05 — Run 6

### State found
- Phase: pre_launch (unchanged); engine_built: true (unchanged)
- Channels connected: none — **6th consecutive run** with connect-channels open. `spend-caps` stays
  closed (owner-attested). No new owner env-var connection since Run 5.
- `site_gate_up`: false (unchanged — HARD BLOCK on execute mode).
- Confirmed no `GROWTH_AGENT_SECRET`/`PROD_URL` in this run's environment (checked `env`) — the
  `/api/growth/stats` pull genuinely cannot be called this run; correctly stayed on code-state reads.
- Real change since Run 5: the product loop shipped **#360** (`feat(analytics): wire the Plausible
  script`) to `web/src/app/layout.tsx` — the code half of `gtm-connect-analytics` is now DONE
  (host+nonce-gated `<script>` tag). This made the `GROWTH_STATUS.validation.sources[in_app_analytics].why`
  text and the matching `PENDING_OPS` item factually STALE (both said "no Plausible script tag exists,"
  which is no longer true).
- Also since Run 5: `docs(quality): independent grade 2026-07-05 (#356)` re-graded the product
  QUALITY_SCORECARD (still overall B, `ship_gate_met: false` — `store_readiness` C, `functional_reality`/
  `tests_evals` B); a `launch_readiness` block (FACTORY_STANDARD §11b, #359) was added to GROWTH_STATUS by
  the product loop and already correctly reflects this — required no correction.
- `GTM_SCORECARD.md` still shows the pre-fix `self_validation_honesty: B` (as_of 2026-06-30) — not
  re-graded since Run 1; still the Auditor's turn, not mine.
- Sam Gutelle (Tubefilter) draft from Run 3: confirmed still unsent (Gmail draft still present, unedited)
  and zero replies (`search_threads` for tubefilter/sam@tubefilter.com returns one unrelated 2023 email).

### What I did this run
- **Corrected the now-stale analytics validation text** in `docs/growth/GROWTH_STATUS.md`
  (`validation.sources[in_app_analytics].why`) and `PENDING_OPS.md` (`gtm-connect-analytics` why/how/title):
  confirmed via reading the #360 diff that the Plausible `<script>` is genuinely wired (host+nonce-gated),
  then re-verified (grep, case-insensitive, across `web/src/lib/growth/` and `web/src/app/api/growth/`) that
  `getGrowthMetrics()` still reads ONLY the KV waitlist store — Plausible is not read anywhere server-side.
  Narrowed the remaining owner ask to exactly two things: create the plausible.io account, and set
  `GROWTH_AGENT_SECRET`. Flagged the still-open engineering gap (no Plausible read-path back into
  `getGrowthMetrics()`, so `visitors_7d`/`visitor_to_waitlist_rate` will stay null even once the account
  exists) as a `next_actions` RECOMMEND — explicitly NOT a roadmap steer (no revenue data attached, it's a
  plumbing gap, and GTM_STANDARD §3's steer bar requires real, significant, revenue-linked data).
- **Followed up on the Run 5 open question** (the Titas Khan / gaming-journalist outreach lead): WebSearch
  (unlike WebFetch, not blocked this run) confirmed Titas Khan's actual beat is esports/game-news reporting
  (Valorant, Dota 2, Roblox, mobile games) — NOT creator-tool/streaming-tool coverage. Does not clear
  OUTREACH.md's beat-match bar; correctly did NOT draft. A second search for named journalists who cover
  AI clip-editing tools specifically surfaced only unattributed review-aggregator/SEO sites (agent-finder.co,
  twoaveragegamers.com) — no identifiable individual with a public professional contact, so no target to name.
  **Zero new outreach drafts this run** — the correct outcome per OUTREACH.md, not a miss.
  Ran one bounded WebSearch check for new HighlightMagic-specific public reviews/complaints (none exist —
  expected pre-launch, zero public footprint); the Run 5 `demand_signal` synthesis needed no update, so left
  it untouched rather than re-running the same citation search for no new evidence (anti-churn).
  Also bumped `as_of` (GROWTH_STATUS + PENDING_OPS) to today and validated both YAML blocks
  (`node scripts/validate-gtm.mjs` + a `yaml.safe_load` check) before committing.
- Ran an independent adversarial reviewer subagent (maker≠checker, fresh context) on the full diff: it
  independently re-read `layout.tsx` and `metrics.ts`, grepped for "plausible" itself, confirmed PR #360 is
  real and correctly cited, confirmed no funnel/pmf/channel number was touched (only prose + `as_of`), and
  re-ran the YAML validator. Verdict: **APPROVE**, zero issues found.

### Learnings
- **A code ship can silently stale a GTM dashboard fact between runs** — #360 landed between Run 5 and
  Run 6 and made a validation `why` field factually wrong (it asserted code that no longer matched reality).
  This is a real category of drift distinct from "owner hasn't acted yet": always re-diff the product loop's
  recent commits touching files a validation `why` cites, not just check env-var names.
  "Code done" and "owner action done" are different facts — narrowing an owner ask to what's ACTUALLY still
  theirs to do (here: just the plausible.io account + a secret, not a script) is itself a real, non-churn
  improvement to `PENDING_OPS.md`'s honesty.
- **WebSearch can clear a lead WebFetch can't** — the Titas Khan beat-mismatch was resolved this run purely
  via WebSearch result snippets, without needing the blocked muckrack/bio-page fetch. Worth trying WebSearch
  first on a blocked-WebFetch outreach lead before giving up on it entirely.
- **Not every "each run" standard clause demands a full redo** — GTM_STANDARD §10 says demand-signal mining
  happens "each run," but re-running the exact same citations search 2 days later without new evidence would
  be padding, not diligence. Did a bounded, cheap check (one search for new product-specific complaints) to
  confirm nothing changed, then explicitly said why no full refresh was warranted — that's the honest middle
  ground between silent staleness and manufactured churn.
- Circuit-breaker discipline held again: 6th consecutive run with connect-channels open; no new escalation
  prose, just the incremented count and this run's two genuinely new, real deliverables (analytics-staleness
  fix + the outreach-lead follow-up) instead of padding.

### Dead ends / what NOT to repeat
- Do NOT draft outreach to Titas Khan (or any similarly-sourced gaming/esports beat journalist without
  independently confirmed tool/software coverage) — confirmed this run via WebSearch: his beat is
  match/game-news reporting, not creator/streaming tools. This lead is now closed, not just unconfirmed.
- Do NOT treat unattributed review-aggregator sites (agent-finder.co, twoaveragegamers.com, similar SEO/
  affiliate content) as outreach targets — there is no named individual with editorial standing to pitch.
- Do NOT re-run the full demand_signal citation search on a 2-day cadence with no new-evidence hypothesis;
  a bounded "anything material changed?" check is enough between full refreshes.

### Circuit-breaker status
- **Still open at Run 6 (6 consecutive runs).** `spend-caps` stays closed; the four `gtm-connect-*` items
  (email/datastore/analytics/social) plus `site-gate` remain open. Analytics narrowed to its true remaining
  scope this run (account + secret only, code is done) but is NOT resolved — still an owner step. The ask
  is otherwise unchanged: Resend per `docs/growth/CONNECT.md` Step 1 (~5 min, free) remains the single
  highest-leverage unlock.

### Next run priorities (Run 7)
1. Check for channel connections (re-probe `env` for `GROWTH_AGENT_SECRET`/`PROD_URL` — never infer from
   git); if any connected, pull real data and move toward execute mode (still gated by `site_gate_up`).
2. Check whether `docs/growth/GTM_SCORECARD.md` was finally re-graded (still shows the pre-fix B as of
   2026-06-30, 3 cycles after the Run 4 fix) — if still B with no new evidence cited, that itself may be
   worth noting as a stale-audit signal.
3. Check whether the Sam Gutelle draft was sent (owner-reported) and update `outreach.owner_sent_7d`.
4. Re-read `GTM_STANDARD.md`/`FACTORY_STANDARD.md` in full, not from memory — both changed recently
   (§11b landed between Run 5 and Run 6).
5. If a genuinely new, verifiable outreach target surfaces (not Titas Khan, not an aggregator site), draft it;
   otherwise zero new outreach remains correct.

---

## 2026-07-09 — Run 7

### State found
- Phase: pre_launch (unchanged); engine_built: true (unchanged).
- Channels connected: none — **7th consecutive run** with connect-channels open. Re-probed `env` for
  `GROWTH_AGENT_SECRET`/`PROD_URL`/`RESEND_API_KEY`/`KV_REST_API_URL`/social tokens: all absent, identical
  to Run 6. As extra diligence (not required by the playbook, since no `GROWTH_AGENT_SECRET`/`PROD_URL`
  means the authenticated pull can't be tried anyway) attempted a direct `curl` to `https://highlightmagic.app`
  — the outbound proxy returned a bare 502 (a network/DNS-layer failure, not an HTTP response from the app
  itself), so this was inconclusive and NOT treated as evidence either way. `site_gate_up` stays `false`
  (fail-closed) until an actual authenticated read confirms otherwise.
- `SITE_GATE_PASSWORD` and `BROWSERBASE_API_KEY`/`BROWSERBASE_PROJECT_ID` are present in this run's shell
  env — these appear to be shared sandbox/validator environment variables (other products' validator
  credentials, e.g. `VALIDATOR_APT_*`/`VALIDATOR_GROCERY_*`, are also present) rather than a confirmed,
  owner-set Vercel production value for HighlightMagic specifically. Per FACTORY_STANDARD §28 (re-probe the
  REAL read path, never infer), correctly did NOT flip `site_gate_up` to `true` on this alone — the actual
  production app was unreachable from this run to confirm it either way.
- `GTM_STANDARD.md` changed materially since Run 6's commit (89a21eb): PRs #367/#370/#371 (all landed AFTER
  Run 6) added a mandated schema to the `demand_signal` block (`overall_strength`, `sources_covered[]` /
  `sources_unconnected[]`, per-theme `label`/`strength`/`cited_count`/`quote`/`url`/`product_solves`,
  `steers_opened[]`) and clarified Reddit/X are ToS-gated data sources, not just key-gated. The
  `demand_signal` block Run 5 wrote predates this schema — a genuine, newly-created artifact-freshness gap
  (the standard changed, not a miss by Run 5/6).
- `GTM_SCORECARD.md` is STILL `as_of: 2026-06-30` — the bootstrap grade, never re-graded even once across
  Runs 2-7 (3+ runs / 9 days since Run 4 (2026-07-01) shipped the fix the Auditor asked for). This is now a
  genuinely notable staleness pattern, not just "not my turn yet."
- Sam Gutelle (Tubefilter) draft (Run 3, 2026-06-29): confirmed via `list_drafts` still present, unedited,
  unsent. `search_threads` for tubefilter/sam@tubefilter.com returns only one unrelated 2023 marketing
  email — zero replies. The draft is now 10 days old, which pushed `outreach.drafted_7d` outside its
  trailing-7-day window (see below).

### What I did this run
- **Restructured `demand_signal` to the new GTM_STANDARD §10 schema** (`docs/growth/GROWTH_STATUS.md`):
  added `overall_strength: emerging` (real, cited, durable core-JTBD pain, but 3 of 4 themes carry material
  counter-signal from established incumbents — not "strong"), `sources_covered[]` / `sources_unconnected[]`
  (Reddit/X explicitly named ToS-gated, not just key-gated, per #371), and per-theme `label`/`strength`/
  `cited_count`/`quote`/`url`/`product_solves` fields. Every citation is UNCHANGED from Run 5's original
  research — this was a living-artifact consistency fix (the standard's required shape changed), not new
  fabricated data.
- **Evaluated the new "demand-driven auto-steer" mechanism (§10) against the restructured themes and
  deliberately opened zero steers.** Themes 1 ("manual editing is a multi-hour time cost") and 3 ("existing
  tools have real trust/pricing friction") both numerically clear the corroboration bar (>=3 independent
  cited posts across >=2 sources, recent + recurring). But theme 1's product-fit IS the product's existing
  core-loop thesis (auto-detect + auto-export) and theme 3's product-fit IS the existing flat-pricing
  decision (5 free/mo, $14.99/$149.99, no credit-expiry traps) — both are already-built/already-decided, not
  new direction. Opening a ROADMAP/BUSINESS_CASE steer to "build" what already exists would be circular, not
  genuine direction-setting, so recording `steers_opened: []` with the reasoning is the honest, non-gamed
  outcome — not a missed opportunity.
- **Corrected `outreach.drafted_7d` from 1 to 0.** The Sam Gutelle draft (created 2026-06-29) is now 10 days
  old — outside the metric's trailing-7-day window. This is a real accuracy fix, distinct from the draft
  itself being resolved (it's still open/unsent, still tracked in `next_actions` and `PENDING_OPS`).
- **Bounded WebSearch refresh** (not a full re-derivation, continuing Run 6's anti-churn discipline): (1) a
  HighlightMagic-specific search found no public footprint (expected pre-launch); (2) a search for
  journalists/press covering AI clip-editing or iOS creator-app launches surfaced no new verifiable
  individual target — same dead end as Runs 5/6, correctly zero new outreach drafts; (3) surfaced two real,
  dated items — X's new iOS in-app video editor (captions/green-screen, announced 2026-07-07) and Apple
  Creator Studio's Final Cut Pro "Edit Detection"/"Auto Mask" AI features (announced 2026-06-30) — judged
  BOTH as tangential, not direct competitors (X's is manual in-app editing, not auto-highlight-detection;
  Apple's is a Mac-only professional NLE feature, not mobile/consumer), and correctly did NOT force a
  competitive-landscape addendum for weak-relevance platform news (avoiding the Run 5/6 mistake pattern in
  reverse — padding rather than staleness).
- Bumped `as_of` in both `GROWTH_STATUS.md` and `PENDING_OPS.md` to 2026-07-09; validated the YAML with
  `python3 -c "import yaml; ..."` and `node scripts/validate-gtm.mjs` (both pass) before committing.
- Ran an independent adversarial reviewer subagent (maker≠checker, fresh context) on the full diff before
  committing.

### Learnings
- **A standard's own required schema can drift out from under an existing artifact** — `demand_signal`'s
  shape changed via #367/#370/#371 (landed after Run 6), so a block that was fully compliant at the time it
  was written became structurally stale without any new data being wrong. Re-check EVERY block's schema
  against the CURRENT standard text each run, not just whether the underlying facts are still accurate.
- **The demand-driven auto-steer bar can be numerically met while still correctly yielding zero steers** —
  clearing "≥3 cited posts, ≥2 sources" is necessary but not sufficient; if the corroborated fit is already
  the product's existing thesis or an already-built decision, steering is circular, not direction-setting.
  Worth stating the reasoning explicitly (`steers_opened_note`) rather than silently doing nothing, so a
  future run (or auditor) can see the bar was actually evaluated, not skipped.
- **Shared sandbox env vars are not evidence of an owner action for THIS product.** `SITE_GATE_PASSWORD` and
  `BROWSERBASE_*` keys appearing in this run's shell alongside other products' validator credentials
  (`VALIDATOR_APT_*`, `VALIDATOR_GROCERY_*`) is a strong signal they're shared execution-environment
  plumbing, not a confirmed HighlightMagic-specific connection — do not treat env-var presence alone as
  proof; only an actual successful read against the real deployed app counts (§28).
- **`_7d` metrics need active decay checking, not just "is the draft still unsent."** A stale numerator
  (drafted_7d staying at 1 for three runs after the draft aged past 7 days) is itself a small honesty bug —
  worth a specific check each run: "is anything counted in a trailing-N-day field now older than N days?"
- GTM_SCORECARD.md staying at its bootstrap grade for 3+ runs / 9 days is now worth flagging plainly as a
  possible stuck signal for the (separate) Auditor routine — not this agent's file, but silence about it
  helps no one.
- Circuit breaker discipline held again: 7th consecutive run, no new escalation prose — incremented the
  count and put the run's effort into the schema-freshness fix, the steer-bar evaluation, and the metric
  correction above instead of padding.

### Dead ends / what NOT to repeat
- Do NOT treat X's new iOS video editor or Apple Creator Studio's Final Cut Pro AI features as direct
  HighlightMagic competitors in the demand_signal/competitive-landscape docs — both are real but tangential
  (manual editing UI / Mac-only pro NLE, not mobile auto-highlight-detection). Re-evaluate only if either
  platform ships an actual auto-highlight/auto-export consumer feature.
- Do NOT infer `site_gate_up: true` or a channel connection from env vars alone (`SITE_GATE_PASSWORD`,
  `BROWSERBASE_*`) without an actual successful probe against the real deployed app — this run's env
  contained other products' validator credentials too, confirming these are shared-environment plumbing.

### Circuit-breaker status
- **Still open at Run 7 (7 consecutive runs).** No new owner action since Run 6. The ask is unchanged:
  connect Resend per `docs/growth/CONNECT.md` Step 1 (~5 min, free) remains the single highest-leverage
  unlock; `site-gate` (SITE_GATE_PASSWORD in Vercel prod env) is the second.

### Next run priorities (Run 8)
1. Re-probe `env` for `GROWTH_AGENT_SECRET`/`PROD_URL`/`RESEND_API_KEY`/`KV_REST_API_URL`/social tokens —
   never infer from git; if any present, pull real data and move toward execute mode.
2. Try `curl https://highlightmagic.app` again — this run's attempt hit a proxy-level 502, inconclusive;
   if it resolves this time, that's a genuine new data point either way.
3. Check whether `docs/growth/GTM_SCORECARD.md` was finally re-graded (still `as_of: 2026-06-30` after 3+
   cycles) — if still unchanged, this is worth surfacing more prominently as a stuck Auditor-routine signal.
4. Check whether the Sam Gutelle draft was sent (owner-reported) and update `outreach.owner_sent_7d`.
5. Re-read `GTM_STANDARD.md` in full, not from memory — it changed materially between Run 6 and Run 7
   (§10 schema + Reddit/X ToS clarification) and could change again.
