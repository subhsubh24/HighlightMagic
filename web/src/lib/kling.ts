/**
 * Backward-compatible re-exports from the generic Atlas Cloud client.
 * Existing imports of `@/lib/kling` continue to work unchanged.
 */
export {
  submitPhotoAnimation,
  checkAnimationResult,
  pollAnimationResult,
  generatePhotoAnimation,
} from "./atlascloud";

/**
 * Backward-compatible type — the /api/animate/check route maps
 * outputUrl → videoUrl for client compatibility.
 */
export interface AnimationPollResult {
  status: "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}
