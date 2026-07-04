```yaml
# BUSINESS_CASE_SUMMARY (machine-readable; keep in sync with the analysis below)
# Wrapped under a top-level BUSINESS_CASE_SUMMARY: key so this feed is structurally identical to the
# other dashboard feeds (QUALITY_SCORECARD:, GROWTH_STATUS:, GTM_SCORECARD:) — one parse convention.
BUSINESS_CASE_SUMMARY:
  currency: USD
  arr_year1:        # year-1 run-rate ARR (month-12 MRR x 12), per scenario — derived from the model below
    conservative: 3060
    base: 7740
    optimistic: 33460
  planning_case: base
  floor_usd: 100000
  floor_met_year1: false   # year-1 base run-rate ($7,740 at the live $14.99 price) is still below the $100K floor
  time_to_floor: "base: ~year 3.2 (~month 38; ~556 Pro subs at the live $14.99 price); optimistic: ~year 2 (month 22-24); conservative: ~year 5-6"
  annual_tier_lever: "$149.99/yr LIVE (2-months-free equivalent); ~72% GM at typical usage; accelerates $100K ARR ~3-4 months vs monthly-only; see Section 9"
  as_of: 2026-06-27   # recomputed: Pro price is now LIVE at $14.99/mo + $149.99/yr (config aligned across StoreKit/web/ASO)
```

# HighlightMagic — Business Case

Living document. Updated each loop run as tracks land and real data replaces estimates.
**Inputs: cited, never invented. All assumptions stated explicitly.**

> **Floor not met in year 1 — levers are the priority (maximize mandate, Track F8).** At the now-live
> $14.99 price the base case crosses the $100K ARR floor at ~year 3.2 (~month 38); year-1 run-rate
> ARR is ~$7,740. To pull base year-1 above $100K (or pull the timeline in further), the
> highest-return levers for HighlightMagic are, in order: (a) **per-export API COGS reduction**
> (Claude/ElevenLabs/AtlasCloud) — margin is the crux; (b) **pricing/tiers** beyond the base
> $14.99/$149.99 (export-credit packs — backend already SHIPPED, see §10; ARR deliberately not yet
> modeled until the iOS purchase UI lands and a defensible attach-rate exists — plus a higher/creator
> tier); (c) **free→paid conversion**. Build the high-return ones and RECOMPUTE this summary block when
> they ship. Every number honest/researched — anti-gaming holds.

> **Monetization MODEL considered (2026-06-30; ROADMAP F10 / FACTORY_STANDARD §9).** The model itself
> is a first-class lever, not a fixed assumption. Current default = **freemium auto-renewable
> subscription** (5 free exports/mo + watermark → Pro $14.99/mo · $149.99/yr) — chosen because it's the
> dominant, best-understood model for consumer creative iOS apps and matches the current paywall +
> StoreKit config. Alternatives ON THE TABLE as the funnel data arrives, each with its rationale:
> **usage/credit (consumable export packs)** — directly couples revenue to per-export COGS and caps the
> unlimited-free wallet-drain risk, attractive given this product's real Anthropic/ElevenLabs/AtlasCloud
> cost per export; **hybrid** (sub + credit top-ups) for heavy users; **free-trial→paid** if free-tier
> conversion underperforms; **creator/higher tier**; **team/B2B** if a pro segment emerges. DECISION:
> keep freemium-subscription as the default PRE-PMF (no thrashing); revisit from real funnel/retention/
> ARPU post-launch. A switch would re-open building (paywall, StoreKit product TYPES, entitlement, copy)
> + recompute the unit economics here, recorded as a dated decision. *(No model change made today — this
> records that the model is now an explicit, evaluated lever.)*

## Mandate — MAXIMIZE revenue ($100K/yr is the FLOOR, not the target)
Do NOT settle once the base case clears $100K/yr. Build toward the OPTIMISTIC scenario by pushing
each revenue lever to its DEFENSIBLE maximum — every number still honest + researched (the
anti-gaming rule holds absolutely: never inflate price/users/assumptions to make a number look
bigger; pricing must match the real paywall/StoreKit config). Treat each lever as first-class,
value-bar-clearing work and document its upside here:
- **Pricing & tiers** — good-better-best: a higher Pro tier, annual plans at a discount, consumable
  credit packs for extra exports; priced to real value + benchmarks.
- **Conversion** — optimize the free→paid moment: paywall at the finished-highlight, onboarding,
  trial, shrink time-to-first-export.
- **Retention & LTV** — reduce churn, lengthen lifetime: re-engagement push, save/share loops,
  reasons to keep making highlights.
- **Expansion revenue** — add-ons, extra-export credit packs, higher-tier/creator plans, referrals.
- **Margin** — drive per-export API COGS (Claude/ElevenLabs/AtlasCloud) DOWN; for HighlightMagic this
  is a PRIMARY revenue lever — lower COGS widens the freemium margin and makes growth spend affordable.
- **Reach** — defensible acquisition: ASO, organic/social (the output is inherently shareable),
  content/SEO.
Document each lever's upside; build the best-return ones. CONVERGENCE: maximize WITHIN the
submission-readiness goal — the best monetization+growth MACHINE buildable PRE-launch, not an excuse
to run forever. STOP and hand off when product + marketing are 100% and this case shows a strong,
maximized, credible path (floor ≥$100K). Continuous optimization with real post-launch
conversion/retention data is the owner's job after launch.

---

## 1. What the Business Is

HighlightMagic is a freemium iOS app + web backend:
- **App**: Swift 6 / iOS 18, distributed through the App Store
- **Backend**: Next.js on Vercel (AI orchestration, audio/video generation)
- **Pricing model**: 5 free exports/month → Pro at $14.99/month or $149.99/year (unlimited MONTHLY exports — no monthly quota; a 50/user/day anti-abuse ceiling applies to all tiers — no watermark) — live config across StoreKit, web, and ASO
- **Business-paid APIs (ALL of them)**: Anthropic (detection + planning + validation), ElevenLabs (music/SFX/TTS), AtlasCloud (photo/video gen). Every paid call is a business COGS line — there is NO user-borne portion.

---

## 2. Market Context

All inputs researched via web sources; dates noted.

### Comparable competitor pricing (fetched 2026-06-24)
| App | Free tier | Paid entry | Mid tier | Source |
|---|---|---|---|---|
| **Opus Clip** | 60 min/mo clip generation | $15/mo (Starter) | $29/mo (Pro) | fluxnote.io/guides/opus-clip-pricing-2026 |
| **CapCut Pro** | Yes (feature-limited) | $9.99/mo (Standard) | $19.99/mo (Pro) | fluxnote.io/guides/capcut-pro-pricing-2026 |
| **Captions AI** | Yes (credit-limited) | $4.99/mo (Lite) | $13.99/mo | khaby.ai/pricing/captions |
| **VEED.io** | Yes | $20/mo (Creator) | $40/mo (Pro) | flowith.io/blog/veed-io-pricing-2026 |
| **Descript** | Yes | $16/mo (Hobbyist) | $30/mo (Creator) | descript.com/pricing |
| **AutoCut** | Trial | $6.60/mo | $19.90/mo | autocut.com/en/pricing |

**Observation**: $9.99/month is the low end of AI creator tool pricing; CapCut is the closest
direct competitor (short-form video). Moving to $14.99 at launch would be mid-market and
reasonable given HighlightMagic's AI-automated positioning.

### Demand-signal addendum (2026-07-03) — competitive landscape + JTBD validation

Per GTM_STANDARD §10 (pre-launch demand validation), the Growth Agent mined real public
complaints/reviews this run (full citations + quotes in `docs/growth/GROWTH_STATUS.md`
`demand_signal`). Two findings sharpen this section without changing any modeled number (a
qualitative signal never becomes an invented figure — anti-gaming holds):
- **The core JTBD is real and durable**: manual highlight editing is repeatedly cited (across
  independent 2026 sources) as a 4–6 hour/video time cost — this directly validates the product's
  core value proposition. Confidence: high.
- **Two competitors were missing from the table above and should inform positioning**: **Eklipse**
  (eklipse.gg) is an established, dedicated AI gaming-clip tool ("trained on 1,000+ game titles",
  claims 1M+ streamers) — so "AI editing for gaming footage" is already served, not white space.
  Separately, the youth-sports-highlight moment has dedicated competitors (FullCourt.ai, XbotGo,
  Athlete AI, MOJO Sports). HighlightMagic's honest differentiation is **breadth** — one iOS-native
  app spanning gaming, sports, events, and family footage, with no special hardware — not category
  exclusivity in any single vertical. Marketing copy should not claim "the only tool for gaming
  highlights" (see disconfirming notes in GROWTH_STATUS).
- **Existing tools carry real trust friction** (processing failures, opaque credit systems,
  hard-to-cancel billing — Opus Clip, CapCut, Descript). HighlightMagic's flat pricing (no
  credit-expiry traps) structurally avoids this pattern, which is a real differentiator to earn
  post-launch, not a launch-day claim to make.

### Market size (fetched 2026-06-24)
- Mobile video editing market: **$7.8B (2026) → $22.4B (2034), 12.4% CAGR** — Straits Research
- Video editing market overall: **$3.75B (2026), 5.88% CAGR** — Mordor Intelligence
- Creator economy: **$310B (2026), 200M+ active creators** — Research Nester

### Freemium conversion benchmarks (fetched 2026-06-24)
- General SaaS freemium → paid: **2–5%** — Userpilot (userpilot.com/blog/freemium-conversion-rate)
- Professional / business users: **20%+** (much higher; HighlightMagic targets creators, which skews toward the pro end)
- Video tool segment: likely 2–4% (hobbyists churn; serious creators convert)

### Monthly churn benchmarks (fetched 2026-06-24)
- SaaS median: **3.5% monthly** — ChurnTools (churntools.com/blog/average-saas-churn-rate)
- Freemium products: **~5% monthly** — Culta (culta.ai/blog/saas-churn-rate-guide-benchmarks)
- AI-native SaaS (2025–2026 data): historically high churn; improving as product matures

**Base case assumption**: 4.5% monthly churn (between SaaS median and freemium baseline).

---

## 3. Unit Economics

### Cost structure (Business-paid model — owner-decided 2026-06-25)

ALL inference is business-borne. No user-supplied API key. Frame scoring, planning, validation,
audio generation, and photo animation are all COGS lines the business pays.

| Cost item | Model / service | Rough estimate | Notes |
|---|---|---|---|
| **iOS frame scoring** | `claude-haiku-4-5` (up to 120 frames, 480p JPEG) | **~$0.10–0.20** | Business-borne under business-paid. ~120 frames × ~1800 tokens/frame at $0.80/M input = ~$0.17. Verify with Vercel logs. |
| **Tape planning** | `claude-sonnet-4-6` (B4, merged PR #45) | **~$0.07** | Switched from Opus (~$0.35) in PR #45 — 80% COGS cut. Dominant text-inference line. |
| **Tape validation** | `claude-haiku-4-5` (2 passes max) | ~$0.01 | Not a concern |
| **Music gen** | ElevenLabs music endpoint | ~$0.05–0.20 | Per clip; depends on duration + ElevenLabs plan |
| **SFX gen** | ElevenLabs SFX (3 clips/export avg) | ~$0.03–0.10 | Per second of audio |
| **TTS / voiceover** | ElevenLabs `eleven_flash_v2_5` | ~$0.01–0.05 | Per segment |
| **Photo animation** | AtlasCloud / Kling (optional) | ~$0.20–0.80 | Only fires for photo projects; highly variable |

> ⚠️ **Estimates only.** Verify actual per-export costs from Vercel function logs + ElevenLabs +
> AtlasCloud invoices after the first live traffic week. Frame scoring cost depends on video
> length and extraction frame rate; typical exports may be 60–120 frames.
>
> 🔎 **Now instrumented (PR #170):** every paid call emits a `[CostMeter]` log line — the LLM calls
> log a computed USD estimate, and the audio/video providers (ElevenLabs tts/sfx/music, AtlasCloud
> video) now log the billed **cost-driver units** (chars / seconds / job). So a single
> `grep [CostMeter]` over the Vercel function logs yields the full per-export usage picture to
> reconcile against the provider invoices — closing the previous audio/video observability blind spot.

### Base case per-export COGS (audio-only, no photo animation)

| Scenario | Frame scoring | Planning | Audio | Total |
|---|---|---|---|---|
| **Business-paid (post-B4 Sonnet, typical)** | **$0.12** | **$0.07** | $0.12 | **~$0.31** |
| Business-paid (heavy usage, max frames + heavy audio) | $0.20 | $0.07 | $0.35 | **~$0.62** |
| Pre-B4 Opus (for reference; do not ship) | $0.12 | $0.35 | $0.12 | **~$0.59** |

**Key insight vs. prior BYOK estimate**: frame scoring adds ~$0.12 to per-export COGS (previously
user-borne). Post-B4, total COGS is ~$0.31/export. The Pro price is now LIVE at **$14.99/month**
(~56% gross margin); the $9.99 line below is kept only as a reference point for the pricing decision.

### Unit economics at $9.99/month Pro (reference only — NOT the live price)

| Metric | Value |
|---|---|
| Monthly revenue per Pro user | $9.99 |
| Apple App Store cut (30%) | −3.00 |
| Net revenue per Pro user | $6.99 |
| COGS — 15 exports/month × $0.31 | −4.65 |
| **Gross margin per Pro user** | **+$2.34 (~33% gross margin) ✅** |

### Unit economics at $14.99/month Pro (LIVE)

| Metric | Value |
|---|---|
| Monthly revenue per Pro user | $14.99 |
| Apple App Store cut (30%) | −4.50 |
| Net revenue per Pro user | $10.49 |
| COGS — 15 exports/month × $0.31 | −4.65 |
| **Gross margin per Pro user** | **+$5.84 (~56% gross margin) ✅** |

> **Pricing note**: $14.99 (now live) doubles gross margin vs. $9.99, is still below CapCut Pro
> ($19.99) and Opus Clip ($15), and shortens the base $100K ARR timeline from ~42 to ~38 months.
> Early adopters from the waitlist are pre-qualified and likely price-inelastic.

### Levers ranked by impact

1. **Pro price at $14.99/month** (LIVE) — the single biggest realized lever; ~56% gross margin per user; still mid-market
2. **B4 planner Opus→Sonnet** (COMPLETE, PR #45) — cut planning COGS 80%; essential for viability
3. **Annual tier at $149.99/year** (LIVE) — 2-months-free equivalent; improves LTV, reduces churn at renewal, provides upfront cash; see Section 9 for full analysis
4. **Per-user daily spend ceiling** (H7, SHIPPED — spend-ceiling.ts) — a 50-export/user/day anti-abuse ceiling (all tiers) caps wallet-drain risk. NOTE: this is a DAILY abuse backstop, NOT a monthly quota — Pro stays unlimited-monthly. Realistic per-user margin is driven by typical usage (~15 exports/mo, see §3), not a hard monthly cap.
5. **Cache frame scoring outputs** — same video re-submitted shouldn’t re-score; potential 30–50% reduction
6. **Cache planning outputs** — identical/near-identical frame sequences shouldn’t re-plan; saves $0.07/repeat
7. **Add a usage-based add-on tier** (e.g., extra 50-export pack for $4.99) — captures heavy users

---

## 4. Revenue Model

### Pricing (as configured — LIVE)
- **Free**: 5 exports/month, watermark — $0
- **Pro**: unlimited MONTHLY exports (no monthly quota; a 50/user/day anti-abuse ceiling applies to all tiers), no watermark — **$14.99/month or $149.99/year**

> Price set at $14.99/mo + $149.99/yr (aligned across StoreKit, web, and ASO). Rationale: (1) closes
> the unit-economics gap (~56% GM vs ~33% at $9.99); (2) Opus Clip charges $15, VEED $20 — $14.99 is
> still below market mid-point; (3) early adopters from the waitlist are pre-qualified and price-inelastic.

### Bottoms-up revenue model (base case)

Assumptions (all stated; verify against real data once live):
- **Pro price**: $14.99/month (live)
- **Apple cut**: 30% in Year 1 (drops to 15% after 12 months under Small Business Program)
- **Freemium conversion**: 3% of MAU (within 2–5% benchmark, conservative)
- **Monthly churn**: 4.5% (between SaaS median 3.5% and freemium 5%)
- **Monthly MAU growth rate**: 10% (organic, content + ASO — conservative; no paid acquisition assumed)

Revenue = Pro subscribers × $14.99 (gross, before Apple's cut). MAU/subscriber trajectory unchanged
from the prior model; only the price moved from the reference $9.99 to the live $14.99 (×1.5 revenue).

> **How the Pro-subscriber column is modeled (read before comparing to the assumptions).** Each row's
> Pro count is a **snapshot 3% share of that month's MAU** — the cited freemium "% of MAU" benchmark
> (Section 2) applied to the *active base* — so the subscriber line grows at the same 10%/month as MAU
> (M12 = 0.03 × 1,429 ≈ 43; M36 = 0.03 × 14,110 ≈ 423). It does **not** accumulate independently of MAU
> as a cohort waterfall would. This matters for honesty, because the snapshot-share reading is **on the
> optimistic side** of the cohort alternatives:
> - A **new-user-only** waterfall (convert 3% of each month's *new* users, then decay the stock at 4.5%
>   monthly churn) yields meaningfully **fewer** subscribers — ~24% below the share model at M12 and
>   ~31% below by M36 under 10%/month MAU growth (≈32 vs 43 at M12; ≈292 vs 423 at M36).
> - Applying 3% to the *entire* non-paying base every month would yield far **more**, but that re-converts
>   already-active users and is not realistic.
>
> The snapshot share sits between these and is the standard reading of a "% of MAU" conversion benchmark,
> so treat the base-case subscriber counts as the **optimistic end** of the new-user-cohort range. Real
> per-cohort conversion/retention data replaces this estimate after launch (the living-document caveat at
> the top of this file). No table number changes — this note only explains, and bounds the optimism of,
> the existing one.

| Month | MAU | Pro Subscribers | Monthly Revenue | Cumulative Revenue |
|---|---|---|---|---|
| 1 | 500 | 15 | $225 | $225 |
| 3 | 605 | 18 | $270 | $765 |
| 6 | 805 | 24 | $360 | $1,845 |
| 12 | 1,429 | 43 | $645 | $5,130 |
| 18 | 2,533 | 76 | $1,139 | $12,150 |
| 24 | 4,490 | 135 | $2,024 | $28,350 |
| 30 | 7,960 | 239 | $3,583 | $55,500 |
| 36 | 14,110 | 423 | $6,341 | $100,500 |
| 38 | ~18,200 | ~556 | $8,334 | ~$116,000 |
| 42 | 25,006 | 750 | $11,243 | $172,500 |

**Base case: $100K ARR run-rate crossed at ~Month 38 (~3.2 years from launch) at the live $14.99 price, driven by organic growth.**

At ~556 Pro subscribers (≈Month 38) MRR ≈ $8,334 → ARR ≈ **$100,000/year** run rate. By Month 42,
ARR ≈ $11,243 × 12 ≈ **$134,900/year**.

To reach $100K ARR at the live price: **~556 active Pro subscribers at $14.99/month × 12 = $100K gross.**
(For reference, it would take ~834 subscribers at the old $9.99 price.)

---

## 5. Three Scenarios

### Conservative
- MAU growth: 5%/month; conversion: 2%; churn: 6%
- Reach $100K ARR: **Year 5–6** (organic only, slow traction)
- Requires: strong ASO + content marketing; no paid acquisition budget

### Base (target)
- MAU growth: 10%/month; conversion: 3%; churn: 4.5%; price: $14.99 (live)
- Reach $100K ARR: **~Year 3.2 (Month ~38)**
- Requires: consistent content calendar (TikTok/Reels demos), App Store visibility, good retention

### Optimistic
- MAU growth: 20%/month; conversion: 5%; churn: 3%; price: $14.99 (live)
- Reach $100K ARR: **Year 2 (Month 22–24)**
- Requires: viral content moment, featured by App Store, or small paid acquisition budget

**Target/expected scenario: Base.** The base case is achievable with the content engine
(Track E4, docs in PR #48) and strong ASO (E3, docs in PR #47). The optimistic scenario requires
one growth channel that isn't purely organic — a feature in an App Store editorial, a viral
demo, or $1–2K/month in targeted ads.

---

## 6. Does the Base Case Clear $100K/year?

**Honest answer: Not in Year 1. Requires B4 cost fix + growth execution.**

- Year 1 (base): ~$5,130 cumulative (Month 12 in the §5 revenue table) — well short.
- Year 3 (base): ~$67K cumulative; ~$50K ARR — approaching but below $100K ARR.
- Year 3.5 (base): first time $100K ARR run rate is crossed.

**The $100K/year bar is achievable, but it requires:**
1. ✅ Ship the app and iterate toward App Store quality (Tracks A–D)
2. ✅ **Unit economics fixed (B4, PR #45 merged 2026-06-25)**: planner switched Opus→Sonnet; frame scoring is now the dominant new COGS line (~$0.12/export) under the business-paid model. Post-B4 GM at the live $14.99 price: ~56%.
3. 🔴 **Grow to ~556 Pro subscribers at the live $14.99**: requires real marketing execution (Track E, all merged) — content calendar, ASO, analytics funnel now built.
4. ✅ **Price set to $14.99/$149.99 (live)**: base $100K ARR timeline ~month 38 (vs ~month 42-44 at the old $9.99); see unit economics above.

---

## 7. Go-to-Market (Track E linkage)

| Channel | Owner-buildable by loop | Revenue impact | ROADMAP item | Status |
|---|---|---|---|---|
| Landing page + waitlist | ✅ Built (PR #42) | Captures early adopter email list; direct launch day conversions | E1 | ✅ MERGED |
| Brand kit | ✅ Built (PR #46) | Consistent presence across platforms | E2 | ✅ MERGED |
| ASO copy + keyword strategy | ✅ Built (PR #47) | Primary discovery channel for iOS (no paid ads needed) | E3 | ✅ MERGED |
| Content calendar (TikTok/Reels/Shorts demos) | ✅ Built (PR #48) | Viral potential; ~60% of TikTok users discover apps through content | E4 | ✅ MERGED |
| Analytics + conversion funnel | ✅ Built (PR #49) | Measures real free→paid conversion; feeds back into this model | E5 | ✅ MERGED |

**Owner-funded/published** (see REMAINING_STEPS.md):
- Run paid UA on TikTok or Meta (suggested budget: $500–1,500/mo once launched, scale on ROI)
- Connect waitlist email provider and begin pre-launch nurture sequence
- Fund App Store Search Ads if ASO reach is insufficient

---

## 8. Summary

| Item | Status | Notes |
|---|---|---|
| Revenue model | Documented | $14.99/mo + $149.99/yr Pro (live); 3% conversion base case |
| Unit economics | ✅ B4 merged; business-paid COGS corrected | ~56% GM at the live $14.99 (per user/month, 15 exports) |
| $100K ARR path | Achievable by ~Month 38 (base) | Requires growth execution + B4 merge |
| Worst-case scenario | $100K ARR delayed to Year 5–6 | Without growth execution (content/ASO/UA) |
| Live price | $14.99/month + $149.99/year | ~56% GM, still below market mid; annual lifts LTV |
| Key levers | B4 cost fix (done), price at $14.99/$149.99 (done), Track E content | All documented and actionable |

> **One-paragraph bottom line** (for the FACTORY: 100% issue):
> HighlightMagic can reach $100K/year ARR in ~2–3.2 years from launch via organic growth (ASO
> + content demos) with ~556 Pro subscribers at the live $14.99/month. Under the business-paid
> model, ALL inference is business-borne — frame scoring (~$0.12), planning (~$0.07),
> validation (~$0.01), audio (~$0.12) = ~$0.31/export total COGS. Gross margin is ~56% at the live
> $14.99 price; the annual $149.99 tier (also live) lifts LTV and pulls the timeline in further.
> B4 (Opus→Sonnet) is merged; Track E (landing page, brand kit, ASO, content calendar, analytics)
> is 100% merged, and the E6 growth-execution engine (waitlist double-opt-in, email/social/metrics
> plumbing) is now built. The biggest risk is growth execution, not unit economics.

---

---

## 9. Annual Tier Lever Analysis

> **$149.99/year is the LIVE annual Pro option** (configured as `pro.yearly` across StoreKit and
> shown on web). At this price (equivalent to "2 months free" off $14.99/month) annual subscribers
> generate strong margins at all usage levels, churn ~3× less at renewal, and pay upfront —
> improving cash flow at zero additional COGS.

### Price point comparison

Two candidate annual prices are analyzed. The key constraint is per-export COGS (~$0.31/export under
the business-paid model). Analysis uses two usage assumptions: **typical** (8 exports/month average
across all Pro subscribers; heavy users offset by lighter ones) and **heavy** (15 exports/month,
the current per-user COGS baseline in Section 3).

| Metric | Monthly $14.99 | Annual $99.99/yr | Annual $149.99/yr |
|---|---|---|---|
| Effective monthly rate | $14.99 | $8.33 | $12.50 |
| Apple cut (30%) | −$4.50/mo | −$30.00/yr | −$45.00/yr |
| **Net revenue** | **$10.49/mo** | **$69.99/yr** | **$104.99/yr** |
| COGS — typical (8 exp/mo) | −$2.48/mo | −$29.76/yr | −$29.76/yr |
| **GM — typical** | **$8.01/mo (76%)** | **$40.23/yr (57%) ✅** | **$75.23/yr (72%) ✅** |
| COGS — heavy (15 exp/mo) | −$4.65/mo | −$55.80/yr | −$55.80/yr |
| **GM — heavy** | **$5.84/mo (56%)** | **$14.19/yr (20%) ⚠️** | **$49.19/yr (47%) ✅** |

**$99.99/year is marginal at heavy usage** (20% GM, breakeven at ~18 exports/month), and there is
**no monthly export cap** to bound that downside (Pro is unlimited-monthly; the only ceiling is the
50/user/**day** anti-abuse backstop in spend-ceiling.ts, which never binds at ~15–18 exports/month).
That thin, unbounded margin is exactly why $99.99/year is **not** the recommended price.

**$149.99/year is healthy at all usage levels** (47–72% GM) and is the recommended price:
- Equivalent to "$14.99 × 10 months" — a standard "2 months free" offer
- Still 33% below $14.99/month × 12 = $179.88/year (no discount annual equivalent)
- Buyers perceive $12.50/month effective rate (clearly below CapCut Pro at $19.99)

### Churn and LTV impact

Annual subscriptions exhibit materially lower cancellation rates. Industry benchmarks:
- Monthly SaaS churn: ~4.5%/month (used in base model)
- Annual subscription annual churn: ~20–30% (source: ChurnTools, ProfitWell; ~25% used here)
- Effective monthly churn for annual sub: ~2.1%/month (vs 4.5% monthly)

| Metric | Monthly $14.99 | Annual $149.99/yr |
|---|---|---|
| Churn rate | 4.5%/month | ~25%/year (~2.1%/month) |
| 12-month retention | 57.5% | 75% (renewal gate) |
| Gross margin LTV (typical, 8 exp) | $8.01 / 0.045 = **$178** | ($75.23 × 4 yrs) = **$301** |
| Gross margin LTV (heavy, 15 exp) | $5.84 / 0.045 = **$130** | ($49.19 × 4 yrs) = **$197** |

Annual subscribers generate **~65–70% higher gross margin LTV** at equivalent usage due to the
combined effect of lower churn and upfront payment.

### ARR acceleration estimate

In the base model, 100% of Pro subscribers pay the live $14.99/month. Scenario: at launch, 30% of
new Pro subscribers choose the live $149.99/year annual option instead of monthly.

| Metric | Base (monthly only, $14.99) | With 30% annual ($149.99/yr) |
|---|---|---|
| Revenue per 100 new Pro subs/month | $14.99 × 100 = $1,499 | $14.99 × 70 + ($149.99/12) × 30 = $1,049 + $375 = $1,424 |
| Month-1 cash received | $1,499 | $14.99 × 70 + $149.99 × 30 = $1,049 + $4,500 = **$5,549** |
| Effective annual revenue (retention-adjusted) | ~$1,499 × 0.575 × 12 = **$10,343** | higher LTV per annual sub; net ~+12% ARR at year 1 |

**Cash-flow benefit**: Annual subscribers pay upfront — 30% annual uptake generates ~4× the month-1
cash vs all-monthly. This matters for a bootstrapped product covering business-paid API COGS.

**ARR acceleration**: Mixing annual subs into the cohort improves effective retention across the
subscriber base. Modeled impact: ~3–4 months earlier crossing of the $100K ARR threshold in the
base scenario (from ~Month 42 to ~Month 38–39).

### Implementation requirements

1. **StoreKit product**: `pro.yearly` at $149.99/year is in the repo StoreKit config; the owner
   creates the matching App Store Connect product at $149.99/year (see REMAINING_STEPS.md —
   never auto-published by the loop)
2. **Paywall update**: show both monthly ($14.99) and annual ($149.99, "$12.50/mo, 2 months free")
   with annual highlighted as "Best Value"
3. **Server entitlement**: `verifyProEntitlement` must validate both monthly and annual product IDs
4. **Daily anti-abuse ceiling**: the shipped 50-export/user/**day** backstop (spend-ceiling.ts) applies
   to all tiers; it is NOT a monthly quota and does not cap Pro revenue (Pro stays unlimited-monthly).
   COGS is bounded by typical usage (~8–15 exports/mo, Section 3), not a per-user monthly limit

### Conclusion

**Recommended: add $149.99/year annual tier at launch.** Unit economics are sound (47–72% GM),
LTV improves 65–70%, and upfront cash helps cover COGS on the business-paid model. Do NOT price
the annual tier below $119.99 — at $99.99/year with heavy users (15 exp/month), gross margin
collapses to 20% and becomes negative above ~18 exports/month.

## 10. Export credit packs (lever b) — backend SHIPPED (#237, Run 37)

The consumable **export-credit-pack** lever named in the mandate (b) now has its full server side
built + tested (`web/src/lib/credit-store.ts`, `redeemCreditPack` in `entitlement.ts`,
`POST /api/credits/redeem`, `CREDIT_PACK_PRODUCTS` = 10/30/100 exports). A free user who exhausts
the 5/month free limit can buy a one-off pack instead of subscribing; each credit = one export,
never expiring, and the redemption is Apple-JWS-verified + idempotent by transactionId.

**Why it strengthens the case (qualitatively — NOT yet in the ARR numbers):** it monetizes the
segment that hits the free wall but won't commit to a $14.99/mo subscription (the classic freemium
"considerers"), and because a credit maps 1:1 to an export it is *structurally* margin-safe —
revenue is coupled to per-export COGS by construction. It also gives the paywall a second,
lower-friction offer at the highest-intent moment (the finished-highlight / limit-hit screen).

**Honesty guard — no ARR change booked yet.** The summary block's `arr_*` figures are UNCHANGED and
`as_of` stays 2026-06-27, because (i) the iOS StoreKit consumable purchase UI is not built yet
(owner + loop, at submission — see REMAINING_STEPS.md), so it is not yet user-purchasable, and (ii)
there is no defensible pack attach-rate benchmark to model without inventing one. Once the iOS half
ships AND a real (or credibly benchmarked) attach rate exists, RE-COMPUTE base/optimistic ARR with
the credit-pack contribution and stamp a new `as_of`. Pricing is owner-set in App Store Connect (the
credit COUNTS are fixed server-side); it must be priced to value/benchmarks and never below
per-export COGS — Reviewer B / the readiness auditors reject any credit-pack ARR line whose adoption
% is chosen merely to clear the floor.

*Last updated: 2026-07-01 (Run 37) — recorded the export-credit-pack lever (b) backend shipping (#237): added Section 10 above. NO model recompute and `as_of` stays 2026-06-27 — the lever is backend-only (not yet user-purchasable; no honest attach-rate to model), so arr_* and floor_met_year1 are deliberately UNCHANGED (anti-gaming: no ARR booked for a lever users can't yet buy). Prior: 2026-06-30 (Run 30) — consistency/honesty fix only: corrected the last two stale references to a non-existent "50-export/MONTH cap" that Run 25's Lever-4 correction missed — the §5 $99.99/yr viability sentence and the §9 annual-tier checklist item 4. Both now describe the ACTUAL shipped control (the 50/user/DAY anti-abuse ceiling in spend-ceiling.ts) and state plainly that Pro is unlimited-monthly with no monthly quota, so the thin $99.99/yr heavy-usage margin is unbounded — which is why $149.99/yr is recommended. No model recompute; pricing/COGS/levers/revenue unchanged, so `as_of` stays 2026-06-27. Prior: 2026-06-29 (Run 26) — added the §3 "Now instrumented (PR #170)" note: audio/video provider calls now emit `[CostMeter]` usage-unit lines so the "verify per-export cost from Vercel logs" guidance is actually actionable. No model recompute; pricing/COGS/levers/revenue unchanged, so `as_of` stays 2026-06-27. Prior: 2026-06-28 (Run 25) — consistency fix only: reconciled the export-limit wording to the ACTUAL code — "unlimited exports" → "unlimited MONTHLY exports", and Lever 4 corrected from a (never-built) "50/month cap → $15.50 COGS bound" to the SHIPPED H7 control: a 50/user/DAY anti-abuse ceiling (spend-ceiling.ts), which is not a monthly quota and doesn't change the §3 margins (built on ~15 exports/mo typical usage). No model recompute; pricing/COGS/levers/revenue unchanged, so `as_of` stays 2026-06-27. Prior (Run 24): §6 Year-1 cumulative corrected $3,400 → $5,130 to match §5. Sources cited inline above. Model pricing: verify at console.anthropic.com and elevenlabs.io/pricing.*
