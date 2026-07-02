# Model Costs & Selection Strategy

HighlightMagic is a **multimodal** app: every export fans out to several paid model calls
(LLM detection + planning + validation, audio generation, video generation). That per-export
fan-out — not the loop's own tokens — is the product's **COGS**, and the free tier gives away
5 exports/user/month. So the cheapest model that still clears each task's quality bar is
directly the difference between a viable freemium margin and a money-loser.

This doc is the **source of truth for which model runs each paid task and why**. It is
maintained by the autonomous loop (ROADMAP **B4**) and is a standing reference, not a one-off.

## The standing mandate

1. **Cheapest passing model by default.** Each task uses the cheapest model that clears its
   quality bar (below). Escalate to a pricier model ONLY on a deterministic signal
   (e.g. low validation confidence), never globally.
2. **Research the open internet, don't trust memory.** Model lineups and prices change fast
   and are past the training cutoff. Before any switch decision, use `WebSearch`/`WebFetch`
   to pull **current** pricing and capabilities for: (a) cheaper hosted models from the same
   or other providers, and (b) **open-source / self-hostable** multimodal models (e.g. served
   via a cheap GPU host or an OpenAI-compatible inference provider). Never hardcode a price in
   this doc as fact — record it with the date and source it was fetched.
3. **Config-driven model map.** Model IDs must live in one place (a config/constant map), so
   swapping a model is a one-line change — not a hunt through call sites. If they aren't yet,
   centralizing them is part of B4.
4. **Measure before and after.** Gate any live-API benchmark behind an env flag so normal CI
   never spends. A switch ships only with a quality check (golden-fixture eval or A/B on real
   inputs) showing the cheaper model still passes.
5. **Minimize payload first.** Often the biggest win isn't the model — it's sending less:
   sample/downscale frames, batch frames, bound clip count/duration, cache identical requests
   (detection-cache + asset-cache), and cap regeneration (≤2 validation passes). Do these
   before reaching for a model swap.

## Current model map (verified 2026-06-25 from `web/src/`)

| Task | Provider | Current model | Call site | Cost lever / candidates to evaluate |
|---|---|---|---|---|
| Edit **planning** (the reasoning step) | Anthropic | `claude-sonnet-4-6` (effort=medium) | `actions/detect.ts` | Switched from Opus 4.8 (2026-06-25). Next: evaluate if effort=low is sufficient for simpler inputs; cache near-identical planning requests. |
| **Frame scoring** / detection | Anthropic | `claude-haiku-4-5-20251001` | `actions/detect.ts` | Already cheap tier. Push payload down: fewer/downscaled frames, larger batches, cache by frame hash. Evaluate an OSS vision model for coarse pre-filtering before the LLM. |
| **Validation loop** | Anthropic | `claude-haiku-4-5-20251001` | `app/api/validate/route.ts` | Already cheap tier. Keep ≤2 passes; prefer plan-layer fixes over asset regen; consider skipping pass 2 when pass 1 confidence is high. |
| **Voiceover / TTS** | ElevenLabs | `eleven_flash_v2_5` | `elevenlabs-tts.ts` | Already the low-cost/low-latency tier. Evaluate OSS TTS (e.g. self-hosted) for the free tier; cache by (text, voice). |
| **Music** | ElevenLabs | music endpoint | `elevenlabs-music.ts`, `music.ts` | Bound duration; cache by prompt+duration; evaluate cheaper/OSS music gen. |
| **SFX** | ElevenLabs | SFX endpoint | `elevenlabs-sfx.ts` | Cache by prompt+duration; only regenerate on genuine content mismatch. |
| **Stems / Scribe / Voice clone** | ElevenLabs | resp. endpoints | `elevenlabs-stems.ts`, `-scribe.ts`, `-voice-clone.ts` | Use only when the feature is actually invoked; gate behind entitlement. |
| **Video gen / upscale / lipsync** | AtlasCloud | per-job | `atlascloud.ts` | **Most expensive per second of output.** Bound resolution/length; cache by input hash; evaluate cheaper providers/OSS video models. |
| **Photo animation** | AtlasCloud (Kling) | `kling-v2.5-turbo-pro` | `kling.ts` | Evaluate a cheaper Kling tier or OSS image-to-video; only animate photos when it adds value (`aiDecideAnimations`). |

> Verify this table against the code each time it's touched — call sites and model IDs move.

## Quality bar per task (a swap must still clear this)

- **Planning**: produces a coherent, on-theme edit plan; no broken/empty fields; respects
  clip/duration bounds. Judged by the validation loop + golden-fixture evals.
- **Frame scoring**: selects highlight ranges within tolerance of the golden fixtures.
- **Validation**: catches the planted defects in eval fixtures without false-flagging good tapes.
- **Audio**: intelligible voice; music/SFX match the requested mood/content; no artifacts.
- **Video/photo**: output matches the prompt; no obvious distortion; correct aspect/length.

## Evaluation & switch protocol

1. Pick the task with the highest `cost × call-frequency` (today: planning, then video).
2. `WebSearch`/`WebFetch` current pricing + capability for cheaper hosted and OSS/self-hosted
   alternatives. Record findings (with date + source URL) in the decision log below.
3. Prototype the swap behind the config model map + an env flag.
4. Run the gated live eval / A/B vs the current model on representative inputs.
5. If the cheaper model clears the quality bar → flip the config default, log the decision and
   the measured per-task cost delta. If not → log why and keep the incumbent.
6. Re-run this for the next-most-expensive task. Re-evaluate periodically as prices change.

## Eval run cost & cadence (real evals spend real money)

The gated real evals (`web/src/evals/*.eval.ts`, run only in `.github/workflows/live-eval.yml` with
`EVAL_MODE=1` + owner-funded keys) cost real API tokens. Governance (see ROADMAP G3 "COST GOVERNANCE"):

| Eval | Measured / expected cost per run | Cadence |
|---|---|---|
| Detection / planning (`detect.eval.ts`) | ~$0.28 (4 fixtures × ~$0.07) | weekly + on-signal |
| Frame scoring (`score.eval.ts`) | a few cents (Haiku vision, 3 small JPEGs) | weekly + on-signal |
| **Video-gen (future, `RUN_VIDEO_EVAL`)** | **$0.10–$1+/clip — the expensive one (~$10–20+/mo if weekly)** | **owner-approved WEEKLY (2026-07-02) — but ONLY once the per-run cost ceiling is IN CODE + the provider spend cap is set; until then manual/on-change only** |

Rules: **weekly + on-signal** (owner-directed monthly→weekly 2026-07-02; cheap evals ~$0.30/run ≈ ~$1.2/mo;
the loop also triggers `live-eval` via workflow_dispatch when it changes a model id or the
detect/score/plan/gen code) — never a per-PR check. The EXPENSIVE video-gen eval stays gated (never
weekly). Each eval
**estimates cost (CostMeter) and ABORTS if a run would exceed `EVAL_MAX_USD` (~$1 default)**. Minimize:
smallest/fewest fixtures, cheapest capable model, cache, cap regeneration; verify eval code
locally/structurally BEFORE a paid run (don't iterate via repeated real runs). Provider `spend-caps`
(PENDING_OPS) are the hard backstop.

## Decision log

| Date | Task | From → To | Quality result | Cost delta | Notes / source |
|---|---|---|---|---|---|
| 2026-06-24 | Planning | `claude-opus-4-6` → `claude-opus-4-8` | not measured (correctness fix) | unknown | `claude-opus-4-6` was an invalid model ID causing API errors on every planning call. `claude-opus-4-8` is the current valid Anthropic Opus model. Pricing updated to Opus-tier estimate ($15/$75 per million tokens); prior $5/$25 was Sonnet-tier and underestimated actual cost. Verify exact pricing at console.anthropic.com. |
| 2026-06-24 | — | baseline snapshot | n/a | n/a | Initial map captured from `web/src/`: Opus 4.6 planning, Haiku 4.5 scoring+validation, ElevenLabs flash v2.5 voice, AtlasCloud + Kling v2.5-turbo-pro video/photo. No swaps yet. |
| 2026-06-25 | Planning | `claude-opus-4-8` → `claude-sonnet-4-6` | Quality: validated by existing 2-pass Haiku validation loop; validated-at-production recommendation; ROADMAP B4 | −80% per planning call: ~$0.35/export → ~$0.07/export (5800 in + 2000 out tokens); flips Pro gross margin from −$0.06 to +$3.40/user/month | Sonnet 4.6 supports same adaptive extended thinking API parameters (`thinking.type: "adaptive"`, `output_config.effort: "medium"`, `max_tokens: 32000`). Pricing: $3/$15 per M tokens (source: platform.claude.com, fetched 2026-06-25). Both Opus 4.8 and Sonnet 4.6 are Claude 4.x models with identical thinking API surface. See docs/BUSINESS_CASE.md §3 for unit economics impact. |
| 2026-07-01 | Planning / scoring / validation (+ loop reviewers) | `claude-sonnet-4-6` / `claude-haiku-4-5` → **evaluated `claude-sonnet-5`; NO SWAP** | Not measured — real G3 eval is BLOCKED on the ANTHROPIC eval key (OWNER_ACTION `validation-capability-anthropic`) | Would be **+~30% per equivalent request** (new tokenizer emits ~30% more tokens; per-token price unchanged) — a COST INCREASE, not a saving | On-signal per B5: Sonnet 5 released, verified on platform.claude.com 2026-07-01 (see subsection below). Standard $3/$15 = same as Sonnet 4.6; intro $2/$10 through 2026-08-31. Capability upgrade at HIGHER effective cost → quality candidate only, not a cost win. Keep incumbents; adopt only on eval evidence. |

### On-signal re-bench — 2026-07-01: Claude Sonnet 5 (evaluated; NO swap)

Triggered by the B5 on-signal rule (a new capable model surfaced). **Verified against Anthropic's
official docs** (platform.claude.com "What's new in Claude Sonnet 5" + Pricing, fetched 2026-07-01) —
NOT from social/promo claims:

- **Model ID `claude-sonnet-5`.** Drop-in for Sonnet 4.6 EXCEPT three breaking behavior changes:
  adaptive thinking is ON by default; manual `thinking:{type:"enabled",budget_tokens}` → **400**;
  non-default `temperature`/`top_p`/`top_k` → **400**. Priority Tier not available.
- **Pricing: standard $3/$15 per M tok — IDENTICAL to Sonnet 4.6** (intro $2/$10 through 2026-08-31).
  It is NOT "cheaper than 4.6." The "~60% cheaper" social framing is vs Opus and ignores the tokenizer.
- **New tokenizer emits ~30% MORE tokens for the same text.** Per-token price is unchanged, so an
  EQUIVALENT request costs **~30% more** than on Sonnet 4.6 — before any extra adaptive-thinking
  tokens. On our margin-critical paths this is a **capability upgrade at HIGHER effective cost, not a
  saving.**

Per-model decision (**no model changed today**):
- **Planner (`claude-sonnet-4-6`) — QUALITY candidate only, kept.** The planner already uses
  `thinking:{type:"adaptive"}` + `output_config.effort:"medium"` and sets NO sampling params
  (`web/src/actions/detect.ts`), so a Sonnet 5 swap is API-compatible (LOW migration risk) — the only
  watch-item is `max_tokens: 32000`, which the +30% tokenizer could make truncate (revisit if adopted).
  BUT it would raise planning COGS ~$0.07 → ~$0.09+/export, eroding the B4 Opus→Sonnet margin win.
  Adopt ONLY if a G3 eval shows a plan-quality gain that justifies the higher COGS — and the 2-pass
  Haiku validation loop already gates plan quality, so the bar is high.
- **Frame scorer + validator (`claude-haiku-4-5`) — KEEP.** High-volume, cost-critical; moving them to
  Sonnet 5 would multiply per-export COGS. Not candidates.
- **Loop's own models (routine config, not this map):** orchestrator + readiness auditors **KEEP Opus
  4.8** (Sonnet 5 is explicitly below Opus-class on the hardest reasoning — exactly our audit role);
  scouts **KEEP Haiku**; the 2 reviewers (Sonnet 4.6) are an OPTIONAL quality upgrade to Sonnet 5 at
  ~30%+ higher review spend + slower (adaptive thinking on) — not a clear win, left unchanged.

**Blocked-on / next step:** the measured quality+COGS A/B needs the ANTHROPIC eval key (OWNER_ACTION
`validation-capability-anthropic`); until it's set the G3 eval can't run, so this stays "evaluate, no
swap." When the key lands, run the planner Sonnet-4.6-vs-5 eval; adopt only on evidence (quality up AND
the COGS increase justified). **Intro window is NOT a reason to rush:** Sonnet 5 standard = Sonnet 4.6
price and the tokenizer makes equivalent requests cost more, so there is no batch-job saving for us.
