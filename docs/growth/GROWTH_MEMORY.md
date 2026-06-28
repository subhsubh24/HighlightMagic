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
