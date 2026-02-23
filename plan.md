# Implementation Plan

## Feature 1: Regenerate with User Feedback

### Flow
1. After first detection, cache frames + scores in module-level memory
2. ResultsStep gets "Regenerate" button → shows feedback input + presets
3. On submit, navigate to detecting step with "replan-only" flag
4. DetectingStep detects replan mode → skips extraction + scoring → only runs planner with feedback
5. planFromScores injects user feedback as "DIRECTOR'S NOTE" in planner prompt

### Files
- NEW: web/src/lib/detection-cache.ts (module-level cache for frames + scores)
- MODIFY: web/src/lib/store.ts (add regenerateFeedback to state + actions)
- MODIFY: web/src/actions/detect.ts (add userFeedback param to planFromScores)
- MODIFY: web/src/components/steps/DetectingStep.tsx (replan mode using cache)
- MODIFY: web/src/components/steps/ResultsStep.tsx (regenerate button + UI)

## Feature 2: Beat-Sync Validation

### Flow
1. After beat-sync adjusts clip durations, validate and report
2. Check transitions land within tolerance of beat boundaries
3. Warn about clips adjusted >30% from original duration
4. Surface warnings in export UI

### Files
- MODIFY: web/src/lib/beat-sync.ts (add validation function)
- MODIFY: web/src/components/steps/ExportStep.tsx (show validation warnings)
