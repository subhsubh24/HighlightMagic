# Demand Validation Kit — HighlightMagic

Executes `docs/growth/DEMAND_VALIDATION_PLAYBOOK.md` for this product. The GTM factory PREPARES
everything below; the OWNER films + posts (hard boundary — no autonomous account creation or
posting, per GTM_STANDARD §7). Every claim below is grounded in the shipped/confirmed product
spec (`docs/press-kit.md`, `docs/BUSINESS_CASE.md`, `docs/growth/demand_signal` in GROWTH_STATUS) —
nothing invented, no music/SFX claimed (confirmed non-functional in v1, see `email-sequences.md`'s
product-facts line).

## A. Hero feature — input → reveal

**Pick: raw footage in → ready-to-post vertical highlight out, under a minute.**

This is HighlightMagic's actual core loop (no invented framing): import a game/trip/concert/event
video → AI samples and scores frames for the moments that matter → auto-assembles a vertical
1080×1920 clip with kinetic captions (7 styles) and color filters (10) → export. It is the single
input→reveal moment that makes the value legible in 3–5 seconds: **hours of raw footage in, a
finished highlight out, with zero scrubbing.** This is also the theme the `demand_signal` block
(GROWTH_STATUS) already validates as `strength: strong` (3 independent cited sources: manual
editing is a real 4–6 hour/video time cost) — the hero feature IS the corroborated pain point, not
a guess.

## B. The content-grade demo (a prop, not the product)

Built this run: `docs/growth/demand-validation-demo.html` — a self-contained, 3-screen static
mockup (phone-frame HTML, no build step, opens in any browser). It is explicitly a PROP for
screen-recording, not the real app:
- **Screen 1 — Before**: an import screen showing a raw-footage thumbnail grid labeled "38 min
  raw footage," a single tap target ("Generate Highlight").
- **Screen 2 — Reveal (bridge)**: a brief processing state — "Finding your best moments..." — the
  AI-at-work beat that makes the cut to Screen 3 feel earned, not instant/fake.
- **Screen 3 — After**: a finished vertical highlight preview with a kinetic caption overlay, a
  "0:27 · Ready to post" label, and a share affordance.
- Uses the real brand tokens (`docs/brand-kit.md`: `--bg-primary #0F0A1A`, `--accent #7C3AED` →
  `--accent-pink #EC4899` gradient, system font stack) so it reads as on-brand, not generic-AI
  slop, when cut next to real footage.
- Fake data only (a placeholder thumbnail grid, illustrative caption text) — never a real user's
  footage or a fabricated metric. If this prototype tests well, hand it to the product factory as
  the seed for the real onboarding "aha" screen (per playbook §E).

**How to use it**: open the file locally or on a phone, film a screen recording of the tap → reveal
transition (Screen 1 → 2 → 3), then cut that into the reaction format below.

## C. Content kit — hooks, shot list, reaction direction

### Hook variations (15 — draft many, test which lands; adapt patterns already working in the
niche, never copy verbatim)

1. "I stopped editing my own highlights. Here's what does it instead."
2. "POV: you have 40 minutes of raw footage and 30 seconds of patience."
3. "This app watched my whole game so I didn't have to."
4. "I used to spend 4 hours editing highlights. Now it's under a minute."
5. "Nobody has time to scrub through their own footage. So I stopped."
6. "Raw footage in. Ready-to-post highlight out. That's the whole video."
7. "The AI found the moment I would've missed scrubbing through this myself."
8. "I filmed the whole thing. I did not edit any of this."
9. "This is what 'no editing skills required' actually looks like."
10. "I gave it my rawest, messiest footage on purpose."
11. "Editing used to be the reason I never posted. Not anymore."
12. "Watch an AI find the 3 moments worth posting out of 40 minutes of nothing."
13. "I have never opened a timeline editor for this."
14. "This is the difference between a 4-hour edit and a 40-second one."
15. "I didn't touch a single clip. The app picked all of it."

Pick hooks that match the footage type being demoed (gaming/sports hooks for gaming/sports
footage, event/travel hooks for that footage) — don't force a mismatched hook onto the visual.

### Demo shot list (the exact input→reveal beat to film on the prototype)

1. Open on the "Before" screen — thumbnail grid, "38 min raw footage" label clearly visible (2–3s).
2. Tap "Generate Highlight" — cut to the brief "Finding your best moments..." bridge state (1–2s,
   keep it short — this is a beat, not a wait).
3. Cut to the "After" screen — the finished vertical highlight with the caption overlay and
   "0:27 · Ready to post" label (2–3s, hold on this — it's the reveal, let it land).
4. Optional: a fast whip-pan or zoom transition between screens 1→3 to sell speed viscerally.

### Reaction + audio direction

- Reaction: genuine surprise/relief at the speed, not performed hype — "wait, that's it?" lands
  better than an exaggerated reaction for this audience (creators who've felt the manual-editing
  pain firsthand, per the corroborated demand signal).
- Trending-audio categories to consider (owner picks the actual track in-app; licensing lives with
  the platform): a "plot twist" / reveal-beat sound, a fast-cut editing-trend sound, or a
  relatable-frustration voiceover trend if one is currently running. Do not hardcode a specific
  track here — trends rotate faster than this doc updates.

### Volume plan

Bulk-record 2–3 reaction takes × the hooks above, across the footage types the product already
targets (gaming, sports/youth-sports, travel/event, family) to see which hook×footage-type
combination gets the strongest intent-comment rate. Post across TikTok/Reels/Shorts. Volume +
iteration beats one polished video — this is a signal-gathering exercise, not a hero-asset shoot.

## D. Reading the signal (owner posts + reports back; factory analyzes)

Views alone are NOT signal. Track, per post: **intent comments** — "what's this called?", "where
can I get this?", "is this real?", "does this work for [my footage type]?" — vs. generic engagement
(likes, "🔥" comments). Report back (or connect the channel's read API) so this agent can compute an
intent-comment rate per hook/footage-type and feed it into:
- `demand_signal` (GROWTH_STATUS) — this is the CREATED-signal counterpart to the mined signal
  already there; keep them clearly labeled as distinct sources.
- Business-case CONFIDENCE (never a fabricated number) — real intent comments raise or lower
  confidence in specific footage-type/ICP assumptions, they never become a customer-count estimate.
- Positioning/ASO — the winning hook language becomes candidate ASO/landing copy, through the
  normal maker≠checker review before it ships anywhere customer-facing.
- A ROADMAP steer ONLY if a footage-type signal clears GTM_STANDARD §10's corroboration bar
  (≥3 independent posts/threads, ≥2 sources, real cited comments) AND is genuinely revenue-linked —
  the normal high bar, not automatic from one viral clip.

**Zero posts filmed yet.** This run BUILT the kit (prototype + hooks + shot list); nothing has been
posted. `GROWTH_STATUS.demand_signal` is unchanged by this — it's still the mined-signal-only block
until real posts + real comment data exist. No signal is fabricated here or implied.

## E. Status

- Hero feature picked: DONE (this run) — grounded in the existing corroborated demand-signal theme,
  not a new guess.
- Prototype built: DONE (this run) — `docs/growth/demand-validation-demo.html`.
- Hooks + shot list + reaction/audio direction: DONE (this run).
- Posted: NOT YET — owner action. Once posted, report results back (views are not enough — the
  comment text is the signal) so this agent can read intent-comment rate next run.
