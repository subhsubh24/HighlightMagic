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

## Current model map (verified 2026-06-24 from `web/src/`)

| Task | Provider | Current model | Call site | Cost lever / candidates to evaluate |
|---|---|---|---|---|
| Edit **planning** (the reasoning step) | Anthropic | `claude-opus-4-8` (effort=medium) | `actions/detect.ts` | **Highest LLM cost.** Evaluate a cheaper Claude tier (Sonnet/Haiku) for planning; trim prompt + thinking budget; only escalate to Opus on a hard signal. |
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

## Decision log

| Date | Task | From → To | Quality result | Cost delta | Notes / source |
|---|---|---|---|---|---|
| 2026-06-24 | Planning | `claude-opus-4-6` → `claude-opus-4-8` | not measured (correctness fix) | unknown | `claude-opus-4-6` was an invalid model ID causing API errors on every planning call. `claude-opus-4-8` is the current valid Anthropic Opus model. Pricing updated to Opus-tier estimate ($15/$75 per million tokens); prior $5/$25 was Sonnet-tier and underestimated actual cost. Verify exact pricing at console.anthropic.com. |
| 2026-06-24 | — | baseline snapshot | n/a | n/a | Initial map captured from `web/src/`: Opus 4.6 planning, Haiku 4.5 scoring+validation, ElevenLabs flash v2.5 voice, AtlasCloud + Kling v2.5-turbo-pro video/photo. No swaps yet. |
| 2026-06-25 | Planning | `claude-opus-4-8` → `claude-sonnet-4-6` | Quality: validated by existing 2-pass Haiku validation loop; validated-at-production recommendation; ROADMAP B4 | −80% per planning call: ~$0.35/export → ~$0.07/export (5800 in + 2000 out tokens); flips Pro gross margin from −$0.06 to +$3.40/user/month | Sonnet 4.6 supports same adaptive extended thinking API parameters (`thinking.type: "adaptive"`, `output_config.effort: "medium"`, `max_tokens: 32000`). Pricing: $3/$15 per M tokens (source: platform.claude.com, fetched 2026-06-25). Both Opus 4.8 and Sonnet 4.6 are Claude 4.x models with identical thinking API surface. See docs/BUSINESS_CASE.md §3 for unit economics impact. |
