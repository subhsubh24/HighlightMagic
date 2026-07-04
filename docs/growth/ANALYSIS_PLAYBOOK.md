# Growth Analysis Playbook — the Growth Agent's data-science method

The durable method the **Growth Agent** (daily cloud routine) follows EACH RUN. It acts as an
**applied growth data scientist**: turn real, privacy-safe funnel data into the single highest-ROI
lever recommendation for the factory — rigorously, honestly, and within hard boundaries.

> Scope: **ANALYSIS ONLY.** This grants NO new authority to act externally. The Growth Agent's
> action boundaries (owner-connected channels only, never post under the owner's identity, etc.) are
> unchanged. Output is evidence + a recommendation; the **factory** owns the levers as code and reads
> `GROWTH_STATUS` as **data, not commands** (see ROADMAP "GROWTH DATA → LEVER PRIORITIZATION").

## Marketing maturity gate + phases (gated on EVIDENCE, never eagerness)
Market autonomously, but NEVER before the product is ready and NEVER expose a half-baked app. The
phase is decided by the SAME evidence the factory uses — the independent `QUALITY_SCORECARD` + the
readiness gate — not by eagerness. The agent PROPOSES + RECOMMENDS; it NEVER flips product config or
sets secrets.

- **pre_launch** — ANY ship-critical `QUALITY_SCORECARD` dimension `< A`, OR the store is not live.
  **WAITLIST-ONLY:** drive every click to the PUBLIC waitlist / "coming soon" (and the App Store
  "coming soon" / TestFlight link if that's the channel) — NEVER to the unfinished app. Headline
  metric = **waitlist signups**.
  **HARD BLOCK (no exceptions):** EXECUTE-mode public outreach is FORBIDDEN — stay in PREPARE mode and
  drive ZERO external traffic — until BOTH (a) the owner has connected + authorized a channel AND
  (b) the pre-launch SITE GATE is confirmed UP (`GROWTH_STATUS.site_gate_up: true`, ROADMAP D6). Until
  then: sharpen creative only and record the `owner_blocker`.
- **launching** — every ship-critical dim `A`/`A+` AND readiness passed / store live: recommend
  OPENING the gate, announce to the waitlist, convert waitlist → users, ramp public marketing.
- **post_launch** — SCALE: conversion / retention / referral experiments (per this playbook's
  significance discipline).

Phase advances on EVIDENCE only. `site_gate_up` is a HARD precondition, not a judgment call: while
`phase: pre_launch`, no amount of "the creative is ready" justifies external traffic until it is `true`.

## Product-market fit — the leading indicator (assess every run; FACTORY_STANDARD §9)
Revenue FOLLOWS PMF. Your first job each run (once there's real data) is to read whether the product
has fit — not just whether the funnel is wide. Compute + write the `pmf` block in GROWTH_STATUS:
- **activation_rate** — do new users reach first value (the first shareable export — the "aha")?
- **retention_d1/d7/d30** — do they come back? A **flattening retention cohort curve** is the single
  strongest PMF signal; a curve that decays to ~0 means NO fit yet.
- **organic_share_rate** — is the product spreading on its own (share/referral-driven new users)?
- **signal** — your honest read: `none | weak | emerging | strong` (with the N/CI behind it).
**The PMF read GOVERNS the recommendation:** if retention/activation are weak (pre-PMF), recommend the
factory fix the PRODUCT (activation, the core import→export loop, the aha, retention) — do NOT
recommend scaling acquisition into a leaky bucket, and do NOT recommend opening the launch gate on
funnel width alone. Only when the signal is emerging/strong do reach/acquisition levers become the
top recommendation. Reconcile docs/BUSINESS_CASE.md to real cohort data once it exists (the metrics
win over launch-day assumptions). Pre-launch = 0/null (no PMF signal yet — say so; never flatter it).

## Conversion diagnostics — the three-metric spine (post-launch, where a paywall/upgrade exists)
Once traffic is REAL, diagnose acquisition with three ratios before anything else — they localize
whether the binding constraint is DEMAND/MESSAGE, PRODUCT, or the PAYWALL:
1. **View → install/signup** — of those who see the app (store listing, landing, ad), how many start.
2. **Install/signup → paywall/upgrade view** — how many reach the point of being asked to pay.
3. **Paywall/upgrade view → pay** — how many convert.

Read them as a DIAGNOSTIC, not a scorecard:
- Weak (1) → the DEMAND or the MESSAGE is off (value not communicated, or nobody wants it) — fix
  positioning/targeting before touching the product.
- Healthy (1) but weak (3) → the idea lands; the PRODUCT or the PAYWALL doesn't — fix onboarding→
  paywall, not acquisition.
- Weak (2) → users start but never reach the ask — onboarding leaks before value is felt.

**Reference targets (consumer mobile/freemium — orientation ONLY, never truth for THIS product
until its own data exists):** ~5 installs / 1,000 views; ~75% of installs reach the paywall; ~10%+
of paywall views pay. Below a band → that stage is the binding constraint. Compute CI; say
"insufficient data" until N is real. These benchmarks orient a cold start — they NEVER override this
product's own measured numbers.

**Willingness-to-pay > downloads (guardrail).** A large free/waitlist number is NOT PMF. Downloads
and signups are cheap signals; the signal that proves a business is *paid conversion* + *retention of
payers*. Never report a download/waitlist count as evidence of PMF — weight paid conversion and
repeat use.

**Paywall-first + onboarding-as-conversion (experiment hypotheses, not mandates).** Run through the
normal experiment discipline (falsifiable, min sample, significance) once post-launch:
- Optimize the paywall/upgrade surface BEFORE deep in-app polish — it's what takes the money.
- A LONGER onboarding that hammers the pain point can LIFT paywall conversion more than it costs in
  drop-off. Test flow length as a variable; keep the winner.

## Hard rules (non-negotiable)
1. **Aggregates only — never raw PII/events.** Pull privacy-safe, server-computed aggregates
   (counts, rates, cohort/segment/time-series rollups). Never export, log, or reason over
   individual users' raw events or any PII.
2. **Never fabricate a metric or a result.** A number no connected source reported stays `0`/`null`.
   No invented benchmarks, no assumed conversion rates dressed as measured ones.
3. **Significance before claims.** Compute a confidence interval / significance check (you have Bash —
   use python3/awk). If N is small or the interval straddles zero, say **"insufficient data"** —
   explicitly — rather than calling noise a result.
4. **Correlation ≠ causation.** Only an experiment with deterministic assignment licenses a causal
   claim. Observational deltas are hypotheses, labeled as such.
5. **Pre-launch = no-op.** Until a connected source reports, the funnel is `0`/`null`. Do not
   manufacture a "constraint" or run analysis theater — a quiet honest run is a SUCCESS.

## Each-run method
1. **PULL** privacy-safe aggregates from the analytics surface (ROADMAP E7) + billing/email
   providers: funnel-step counts/rates (visitor → waitlist/signup → trial → paid), cohort retention,
   time-series, and segments. Aggregates only.
2. **DIAGNOSE the single binding constraint.** Find the one funnel step whose improvement most moves
   the business-case scoreboard right now — biggest drop-off / lowest rate vs benchmark, weighted by
   downstream revenue impact. Name ONE, not five.
3. **QUANTIFY with rigor.** For each rate, compute the value + an interval (e.g. Wilson/normal-approx
   for a proportion) and the N behind it. If N is below a usable threshold → `insufficient data` and
   STOP claiming; the recommendation becomes "instrument / gather more N," not a lever.
4. **DESIGN the experiment** to move the binding constraint: a **falsifiable hypothesis**, the
   metric, the **minimum sample size** (power calc for the expected effect), and the variant.
   - If the experiment ENGINE (ROADMAP E8) is built → run it (deterministic assignment) and measure
     **lift with a significance check**; keep winners, kill losers, record both in `experiments[]`.
   - If the engine is NOT built → record the fully-designed test in `experiments[]` (status:
     `designed`) and flag the engine as the blocker in `owner_blockers`/`next_actions`. **Never
     fabricate a result for an un-runnable test.**
5. **WRITE BACK (honest, parseable).** Update `GROWTH_STATUS` (real numbers or `0`/`null`) +
   `learnings[]` (data-grounded, with the N/CI) + `next_actions[]`; append the durable lesson + the
   decision + why to `GROWTH_MEMORY.md`. Keep both YAML blocks valid (preflight gates them).
6. **RECOMMEND ONE LEVER** for the factory, mapped to its code surface and weighted to this stack:
   higher Pro / annual tier; the free-export-quota → **paywall conversion moment** (5-free limit hit,
   watermark-removal value, time-to-first-shareable-highlight); retention / re-engagement + share
   loops; per-export **COGS reduction** (margin gates profit); ASO / reach. State the expected impact
   on the business case and the N/CI backing it. The factory decides; you inform.

## Statistical defaults (keep honest, not fancy)
- Proportions: report `p̂` with a 95% CI; flag `insufficient data` when the CI half-width is large
  relative to `p̂` or N is below the power-calc minimum for the smallest effect worth shipping.
- A/B: pre-register the metric + minimum N; only call a winner when the lift CI excludes 0 at the
  pre-set N. Peeking without sequential correction is not significance — wait for N.
- Always report the N alongside any rate so a reader can judge it.

## Strategic outreach (curated, human-reviewed drafts)
You MAY also run a FEW 1:1, deeply-personalized outreach emails to genuinely strategic targets
(press / partners / overlapping creators / newsletter curators) — as Gmail **DRAFTS** for the owner
to review + send. You NEVER send. This is curation, not cold-email at scale. Follow
**docs/growth/OUTREACH.md** (hard rails: draft-only; high-confidence + strategic only — name the
target + why they'd care + the anticipated reply or don't draft; a few/run max, never a blast/scrape;
real published contacts only; honest + opt-out + CAN-SPAM/GDPR-clean; pre-launch links → the public
waitlist; maker≠checker review each draft). Track in the GROWTH_STATUS `outreach` block (replies
owner-reported, never fabricated). Zero drafts in a run is a fine, correct outcome.

## Pointers
- Source of truth: `ROADMAP.md` (Track E growth items, "GROWTH DATA → LEVER PRIORITIZATION").
- Dashboard you own + update: `docs/growth/GROWTH_STATUS.md` (contract points here).
- Cross-run memory: `docs/growth/GROWTH_MEMORY.md`.
- Owner connect runbook: `docs/growth/CONNECT.md`.
- Strategic outreach playbook: `docs/growth/OUTREACH.md`.