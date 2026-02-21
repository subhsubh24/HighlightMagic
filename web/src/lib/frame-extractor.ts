"use client";

import { FRAME_SAMPLE_INTERVAL_SECONDS } from "./constants";

/**
 * Extract frames from a video at regular intervals as base64 JPEG.
 * Uses OffscreenCanvas when available, falls back to regular Canvas.
 */
export async function extractFrames(
  videoUrl: string,
  duration: number,
  onProgress?: (pct: number) => void
): Promise<{ timestamp: number; base64: string }[]> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video for frame extraction"));
  });

  const canvas = document.createElement("canvas");
  // Sample at 480p for faster upload
  const scale = Math.min(1, 480 / video.videoHeight);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d")!;

  const frames: { timestamp: number; base64: string }[] = [];
  const interval = FRAME_SAMPLE_INTERVAL_SECONDS;
  const totalFrames = Math.floor(duration / interval);

  for (let i = 0; i <= totalFrames; i++) {
    const time = i * interval;
    video.currentTime = time;

    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
    frames.push({ timestamp: time, base64 });

    onProgress?.(((i + 1) / (totalFrames + 1)) * 100);
  }

  return frames;
}
