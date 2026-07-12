# Margin eval coverage — HighlightMagic LLM operations

Enumeration of every **LLM (Claude/Anthropic) operation** in HighlightMagic, whether it is
metered to Margin, whether it has a Margin eval, and its relative economic weight. This is the
**frontier map**: it marks what is covered now and what is next. (Media/voice providers —
ElevenLabs TTS/SFX/stems, AtlasCloud/Kling video — are **unit-metered per call** and are NOT
LLM operations, so they are listed at the bottom for completeness but are out of scope for the
LLM cost-per-outcome evals.)

Provider = **Anthropic** for every row below.

## The `highlightmagic-tape` supply chain (the core workflow)

The tape is a chain of three LLM operations. Each is now its own graded supply-chain node.

| Operation | What it does | Metered path (`file:line`) | Emits to Margin? | Outcome signal | Evaled? | Rel. spend / importance |
|---|---|---|---|---|---|---|
| **scorer** | Haiku **vision** scores each frame 0–1 by highlight salience | `actions/detect.ts:580` `scoreSingleBatch` → `analyzeMultiBatch`, emit `detect.ts:1072` | ✅ call (`workflowId=highlightmagic-tape`) | well-formed / non-degenerate / robust (graded by eval) | ✅ **`--suite scorer`** (normal + edge/fuzz pixels) | **High** — vision tokens × many frames/batches |
| **planner** | Sonnet turns scores into the full edit plan (clips, theme, SFX, VO, intro/outro) | `actions/detect.ts:654` `planFromScores` → `planHighlightTape`, emit `detect.ts:2823` | ✅ call | valid/coherent plan: clip bounds, coverage, ordering, plan fields (graded) | ✅ **`--suite planner`** (matrix + degenerate/adversarial) | **Highest** — Sonnet + adaptive thinking, longest generation |
| **validator** | Haiku reviews the assembled tape, returns `{passed, issues, fixes}` | `app/api/validate/route.ts:257` call, emit `route.ts:296` (call) + `route.ts:352` (**outcome**) | ✅ call **+ outcome** | discrimination: pass good tapes, flag bad ones (graded) | ✅ **`--suite validator`** (labelled good/bad + fuzz) | **Medium** — Haiku, short prompt |
| _tape (end-to-end)_ | the chain as one workflow | all three above | ✅ (via the three) | `qualityScore = 1 - min(issues,5)/5` | ✅ **`--suite tape`** (50-case matrix) | sum of the three |

## Other LLM call-sites (the frontier)

| Operation | What it does | Path (`file:line`) | Emits to Margin? | Outcome signal | Evaled? | Rel. spend / importance |
|---|---|---|---|---|---|---|
| **plan (web route)** | web client's planner entry | `app/api/plan/route.ts:147` → `planFromScores` | ✅ (reuses the metered planner fn) | same as planner | ⚠️ covered **indirectly** (same fn as `--suite planner`) | High |
| **ios-plan** | iOS app's planner proxy | `app/api/ios-plan/route.ts:126` → `planFromScores` | ✅ (reuses the metered planner fn) | same as planner | ⚠️ indirectly (same fn) | High |
| **score (web/iOS proxy)** | keyless proxy so the iOS app never embeds the key; own Haiku **vision** call | `app/api/score/route.ts:114` | ❌ **not metered** (CostMeter log only) | none emitted | ❌ **FRONTIER** | High (duplicate of scorer for iOS) |
| **ios-score** | iOS frame-scoring proxy; own Haiku **vision** call | `app/api/ios-score/route.ts:~215` | ❌ **not metered** | none | ❌ **FRONTIER** | High |
| **ios-validate** | iOS validator; own Haiku call, returns `{passed, issues, fixes}` | `app/api/ios-validate/route.ts:257` | ❌ **not metered** | `{passed, issues}` (not emitted) | ❌ **FRONTIER** (top uncovered — has a real outcome signal) | Medium |
| **validateTape** | a second, older Haiku tape reviewer | `actions/detect.ts:704` | ❌ not metered | `{passed, issues, suggestions}` | ❌ **DEAD CODE** — no callers (grep-verified); candidate for removal, not eval | — |

### Frontier notes
- **iOS operations are unmetered.** `ios-score` / `score` (vision) and `ios-validate` make their
  **own** Anthropic calls and emit nothing to Margin — so the iOS app's economics are invisible.
  These are the top uncovered nodes. First pass leaves them on the frontier; wiring `getMeter()`
  into them (or routing them through the metered `detect.ts` functions) is the next step.
- **`validateTape` is dead code** (no callers). Listed for completeness; it should be deleted, not
  evaled.
- **`plan` / `ios-plan`** already emit via the shared metered `planFromScores`, so the planner
  node's economics include them; the `--suite planner` eval exercises that same function.

## Coverage summary (LLM operations)

- **Distinct LLM operations:** 6 (scorer, planner, validator, score-proxy, ios-score, ios-validate)
  + 1 dead (`validateTape`).
- **Metered to Margin:** 3 core (scorer, planner, validator) — planner also covers plan/ios-plan.
- **Directly evaled (this pass):** the 3 core operations, each with its own graded per-node suite,
  plus the end-to-end tape. → **3/6 operations directly evaled (50%)**; the 3 uncovered are the
  iOS/proxy duplicates on the frontier.
- **Edge/fuzz coverage:** scorer (noise/black/white/tiny/duplicate), planner (all-zero, identical,
  single-frame, adversarial/injection labels, dense), validator (single-clip, malformed fields).

## Non-LLM providers (out of scope for these evals — unit-metered per call)

ElevenLabs (TTS `voiceover`, SFX `sfx`, stems `stems`, voice-clone), AtlasCloud/Kling video
(`animate/*`, `talking-head`, `style-transfer`, `upscale`, `thumbnail`, `intro`, `outro`, `music`).
These are media-generation calls metered by unit/asset, not LLM cost-per-outcome. See
`web/src/lib/provider-usage-metering.ts` and the existing `elevenlabs.eval.ts` / `atlascloud.eval.ts`.
