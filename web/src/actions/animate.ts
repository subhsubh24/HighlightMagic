"use server";

import { generatePhotoAnimation } from "@/lib/kling";

/**
 * Server action: animate a photo using Kling 3.0 via Atlas Cloud.
 * Keeps the ATLASCLOUD_API_KEY server-side.
 *
 * @param imageUrl - Public URL of the photo to animate
 * @param prompt - Motion description (e.g. "gentle camera push-in, hair blowing in wind")
 * @param duration - Video duration in seconds (default 5)
 * @returns The generated video URL
 */
export async function animatePhoto(
  imageUrl: string,
  prompt: string,
  duration: number = 5
): Promise<string> {
  if (!imageUrl) throw new Error("Image URL is required");
  if (!prompt) throw new Error("Animation prompt is required");

  return generatePhotoAnimation(imageUrl, prompt, duration);
}
