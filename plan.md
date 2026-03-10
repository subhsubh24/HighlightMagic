# Validation Loop Plan

## Overview

Add a validation loop between the generation phase and the Results step. After all assets are generated, Haiku reviews the full assembled tape and can surgically fix issues — including regenerating specific expensive assets (a single SFX, intro card, voiceover segment, etc.) — before proceeding. Max 2 validation passes, then proceed regardless.

## Architecture

```
[All generators settle] → [Validation Pass 1] → passed? → [Results]
                                                  ↓ failed
                                          [Apply fixes + regenerate targeted assets]
                                                  ↓
                                          [Validation Pass 2] → [Results] (always)
```

## Implementation Steps

### 1. New types in `types.ts`

```ts
export type ValidationStatus = "idle" | "validating" | "fixing" | "passed";

export interface ValidationFixes {
  clipUpdates?: Array<{ clipIndex: number; updates: Partial<EditedClip> }>;
  clipRemovals?: number[];
  regenerateMusic?: { prompt: string; durationMs: number };
  regenerateSfx?: Array<{ clipIndex: number; prompt: string; durationMs: number }>;
  regenerateVoiceover?: Array<{ clipIndex: number; text: string }>;
  regenerateIntro?: { text: string; stylePrompt: string; duration: number };
  regenerateOutro?: { text: string; stylePrompt: string; duration: number };
  planUpdates?: Partial<AiProductionPlan>;
}

export interface ValidationResult {
  passed: boolean;
  issues: string[];
  fixes: ValidationFixes;
}
```

### 2. Store changes in `store.ts`

- Add `validationStatus: ValidationStatus` to `AppState` (default `"idle"`)
- Add `SET_VALIDATION_STATUS` action
- Reset `validationStatus` to `"idle"` in `SET_REGENERATE_FEEDBACK` (when user triggers regeneration)

### 3. New API route: `web/src/app/api/validate/route.ts`

**POST endpoint** that calls Haiku with the full assembled tape state.

**Input:** clips, production plan, media file metadata, asset statuses (what generated successfully, what failed), content summary.

**Haiku system prompt** — upgraded version of the existing `validateTape` but returns structured fixes instead of just pass/fail:

Checks:
- Hook quality (is clip 1 the strongest opener?)
- Pacing (energy oscillation, no dead stretches)
- Transition logic (types match energy changes between clips)
- Source coverage (every uploaded file appears at least once)
- Caption quality (punchy, varied, no cliché)
- Narrative arc (build-up, climax, resolution)
- SFX fit (do prompts match the clip content?)
- Voiceover coherence (does the text match what's happening?)
- Intro/outro relevance (does the text match the content summary?)
- Failed assets (anything that failed to generate that matters)
- Audio balance (volume levels make sense)

**Output JSON:**
```json
{
  "passed": true/false,
  "issues": ["Clip 3 SFX 'ocean waves' doesn't match a basketball clip"],
  "fixes": {
    "clipUpdates": [{ "clipIndex": 2, "updates": { "captionText": "GAME TIME" }}],
    "regenerateSfx": [{ "clipIndex": 2, "prompt": "basketball dribble and crowd cheer", "durationMs": 2000 }],
    "planUpdates": { "sfxVolume": 0.7 }
  }
}
```

**Prompt rules for Haiku:**
- PASS if the tape is good enough to post — don't be a perfectionist
- Only flag real problems that would hurt engagement
- When flagging an issue, MUST provide the structured fix (not just the problem)
- Prefer plan-layer tweaks (instant) over asset regeneration (expensive)
- Only request regeneration when content is genuinely wrong (mismatched SFX, misleading intro text)
- Max 3 regenerations per pass to keep cost bounded
- Never regenerate music unless it completely mismatches the content mood
- If an asset failed to generate, don't flag it — failures are already handled gracefully

### 4. Fix applicator utility: `web/src/lib/validation-fixes.ts`

**New file** with a pure function:

```ts
export function applyClipFixes(clips: EditedClip[], fixes: ValidationFixes): EditedClip[]
```

- Merges `clipUpdates` into matching clips by index
- Filters out clips at indices in `clipRemovals`, re-numbers `order` field
- Returns new array (immutable)

### 5. Regeneration helpers in `DetectingStep.tsx`

Extract the existing inline fetch+dispatch patterns into reusable functions within the component. These already exist as inline code blocks — just wrap them so the validation loop can call them individually:

- `regenerateSpecificSfx(clipIndex, prompt, durationMs)` → fetches `/api/sfx`, dispatches `UPDATE_SFX_TRACK`
- `regenerateSpecificVoiceover(clipIndex, text, voiceCharacter)` → fetches `/api/voiceover`, dispatches `UPDATE_VOICEOVER_SEGMENT`
- `regenerateIntroCard(text, stylePrompt, duration)` → fetches `/api/intro`, polls, dispatches `SET_INTRO_CARD`
- `regenerateOutroCard(text, stylePrompt, duration)` → fetches `/api/outro`, polls, dispatches `SET_OUTRO_CARD`
- `regenerateMusic(prompt, durationMs)` → fetches `/api/music/submit`, polls, dispatches `SET_AI_MUSIC_RESULT`

These are thin wrappers around the existing fetch + poll + dispatch logic already present in DetectingStep.

### 6. Validation loop in `DetectingStep.tsx`

**Location:** After `Promise.allSettled` (line ~1370) and before `SET_STEP "results"` (line ~1382).

```
setProgress(95);
dispatch SET_VALIDATION_STATUS "validating"
set UI text: "Validating your highlight reel..."

for pass = 0; pass < 2; pass++:
  if aborted: break

  call POST /api/validate with current state (15s timeout, fail-open)

  if passed: break

  dispatch SET_VALIDATION_STATUS "fixing"
  set UI text: "Polishing — fixing N issue(s)..."

  apply plan-layer fixes instantly (clipUpdates, clipRemovals, planUpdates)
  dispatch updated clips + plan to store

  fire targeted regeneration promises in parallel (only the specific assets Haiku flagged)
  await Promise.allSettled(regeneration promises)

dispatch SET_VALIDATION_STATUS "passed"
setProgress(100)
proceed to results
```

### 7. UI treatment (within existing DetectingStep progress area)

No new step in the stepper nav. No new screen. It's a sub-phase of the existing "Analyze" step at progress 95-99%.

- **Validating:** "Validating your highlight reel..." with a shield/sparkle icon
- **Fixing:** "Polishing — adjusting [pacing/captions/transitions]..." showing the issue count, with a wrench/sparkle icon
- **Regenerating:** If assets are being regenerated, show which ones: "Regenerating intro card..." / "Regenerating 1 sound effect..."
- Progress bar sits at 95-99% during validation, hits 100% when done

Total added time for most runs (where validation passes): ~1-2s (single Haiku call).
Worst case (2 passes + targeted regenerations): ~15-30s depending on what's regenerated.

### 8. Guardrails

- **Max 2 passes** — hard cap via for loop, proceed to results regardless after pass 2
- **15s timeout per Haiku call** — fail open on timeout (treat as passed)
- **Max 3 regenerations per pass** — enforced in the API route prompt and validated server-side (truncate excess regeneration requests)
- **Fail-open on any error** — network failure, JSON parse error, timeout → skip validation, proceed to results
- **No infinite loops** — bounded for loop guarantees termination
- **Abort-aware** — checks abort signal before each pass and before regenerations
- **Cost bounded** — Haiku is cheap (~$0.001/call), regenerations are surgical (1-3 specific assets, not all)

### Files changed

| File | Change |
|------|--------|
| `web/src/lib/types.ts` | Add `ValidationStatus`, `ValidationFixes`, `ValidationResult` types |
| `web/src/lib/store.ts` | Add `validationStatus` to state + `SET_VALIDATION_STATUS` action |
| `web/src/app/api/validate/route.ts` | **New** — Haiku validation endpoint |
| `web/src/lib/validation-fixes.ts` | **New** — `applyClipFixes` pure utility |
| `web/src/components/steps/DetectingStep.tsx` | Validation loop + regeneration helpers + UI sub-phase |
| `web/src/lib/store.test.ts` | Add test for new action |
