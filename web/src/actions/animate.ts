"use server";

import { generatePhotoAnimation } from "@/lib/kling";

/**
 * Server action: animate a photo using Kling 3.0 via Atlas Cloud.
 * Keeps the ATLASCLOUD_API_KEY server-side.
 *
 * Accepts either a public URL or a base64-encoded image (data URI).
 * Atlas Cloud requires a publicly accessible image URL, so if a base64 data URI
 * is provided, it's passed directly (Atlas Cloud may support it). If not,
 * a temporary upload step would be needed.
 *
 * @param imageData - Public URL or base64 data URI of the photo
 * @param prompt - Motion description (e.g. "gentle camera push-in, hair blowing in wind")
 * @param duration - Video duration in seconds (default 5)
 * @returns The generated video URL
 */
export async function animatePhoto(
  imageData: string,
  prompt: string,
  duration: number = 5
): Promise<string> {
  if (!imageData) throw new Error("Image data is required");
  if (!prompt) throw new Error("Animation prompt is required");

  return generatePhotoAnimation(imageData, prompt, duration);
}
