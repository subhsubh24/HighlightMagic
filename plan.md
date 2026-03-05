# Implementation Plan

## Feature: Photo Animation via Kling 3.0 (Atlas Cloud)

Add per-photo animation controls in the upload step. When a user checks "Animate this photo", the photo gets sent to Kling 3.0 (via Atlas Cloud) to generate a short video clip. Users can optionally provide motion instructions; if left blank, Opus generates the prompt during the planning phase.

---

### Step 1: Update Types
**File:** `web/src/lib/types.ts`

Add to `MediaFile` interface:
- `animatePhoto: boolean` (default `false`)
- `animationInstructions: string` (default `""`)
- `animatedVideoUrl: string | null` (populated after Kling returns)
- `animationStatus: "idle" | "generating" | "completed" | "failed"` (track generation state)

---

### Step 2: Update Store
**File:** `web/src/lib/store.ts`

- Add action: `UPDATE_MEDIA_ANIMATION` — updates `animatePhoto` and `animationInstructions` for a given file ID
- Add action: `SET_ANIMATION_RESULT` — sets `animatedVideoUrl` and `animationStatus` for a given file ID

---

### Step 3: Upload Step UI — Per-Photo Animation Controls
**File:** `web/src/components/steps/UploadStep.tsx`

For each file tile where `type === "photo"`, add below the thumbnail:
- **Checkbox**: "Animate this photo" — toggles `animatePhoto`
- **Text input** (shown when checkbox is checked): placeholder "Describe the motion... (optional — AI will decide if left blank)" — binds to `animationInstructions`, max 500 chars
- Video files don't get these controls

---

### Step 4: Atlas Cloud Kling API Client
**New file:** `web/src/lib/kling.ts`

- `generatePhotoAnimation(imageUrl: string, prompt: string, duration?: number)` — submits task
  - `POST https://api.atlascloud.ai/api/v1/model/generateVideo`
  - Body: `{ model: "kwaivgi/kling-v3.0-pro/image-to-video", image, prompt, duration: 5, cfg_scale: 0.5, sound: false }`
  - Auth: `Bearer ${ATLASCLOUD_API_KEY}`
  - Returns prediction ID
- `pollAnimationResult(predictionId: string)` — polls every 5s, 3-min timeout, returns video URL

---

### Step 5: Server Action for Animation
**New file:** `web/src/actions/animate.ts`

- Server action `animatePhoto(imageUrl: string, prompt: string)` that:
  1. Calls `generatePhotoAnimation` to submit the task
  2. Calls `pollAnimationResult` to wait for the video
  3. Returns the video URL
- Keeps the API key server-side

---

### Step 6: Wire Animation into the Detection Pipeline
**File:** `web/src/actions/detect.ts`

After Opus planning completes, for any photo with `animatePhoto: true`:
- If `animationInstructions` is empty → use Opus-generated `animationPrompt`
- If `animationInstructions` is provided → use that directly
- Fire off all Kling calls in parallel, report progress via SSE

**Opus prompt update:** When Opus sees a photo clip with `animatePhoto: true` and no user instructions, generate an `animationPrompt` field describing the ideal motion.

---

### Step 7: Update .env.example
**File:** `web/.env.example`

Add `ATLASCLOUD_API_KEY=`

---

### Step 8: Preview Support
**File:** `web/src/components/TapePreviewPlayer.tsx`

When rendering a photo clip with `animatedVideoUrl`, use the video instead of static image. Falls back to static + Ken Burns if not yet completed.

---

### Out of Scope (for later)
- Pro-tier gating
- iOS native export with animated photos
- Cost/usage tracking
- Retry UI if animation fails
