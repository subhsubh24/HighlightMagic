"use server";

import { submitPhotoAnimation, checkAnimationResult, type AnimationPollResult } from "@/lib/kling";

/**
 * Server action: submit a photo animation task to Kling 3.0 via Atlas Cloud.
 * Returns the prediction ID immediately — client polls via checkAnimation().
 *
 * This is a fast call (~1-2s) that won't hit server action timeout limits.
 *
 * @param imageData - Public URL or base64 data URI of the photo
 * @param prompt - Motion description (e.g. "gentle camera push-in, hair blowing in wind")
 * @param duration - Video duration in seconds (default 5)
 * @returns Prediction ID for polling
 */
export async function submitAnimation(
  imageData: string,
  prompt: string,
  duration: number = 5
): Promise<string> {
  if (!imageData) throw new Error("Image data is required");
  if (!prompt) throw new Error("Animation prompt is required");

  return submitPhotoAnimation(imageData, prompt, duration);
}

/**
 * Server action: check the status of a photo animation task (single check, no loop).
 * Called repeatedly from the client every ~5s until complete.
 *
 * This is a fast call (~200ms) that won't hit server action timeout limits.
 */
export async function checkAnimation(predictionId: string): Promise<AnimationPollResult> {
  if (!predictionId) throw new Error("Prediction ID is required");
  return checkAnimationResult(predictionId);
}
