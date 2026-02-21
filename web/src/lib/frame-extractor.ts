"use client";

import { FRAME_SAMPLE_INTERVAL_SECONDS } from "./constants";
import type { MediaFile } from "./types";

export interface ExtractedFrame {
  sourceFileId: string;
  sourceFileName: string;
  sourceType: "video" | "photo";
  timestamp: number;
  base64: string;
}

/**
 * Extract frames from a single video at regular intervals as base64 JPEG.
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

/**
 * Extract frames from multiple media files (videos + photos) for multi-clip analysis.
 * Returns frames tagged with their source file ID.
 */
export async function extractFramesFromMultiple(
  mediaFiles: MediaFile[],
  onProgress?: (pct: number) => void
): Promise<ExtractedFrame[]> {
  const allFrames: ExtractedFrame[] = [];
  let completedFiles = 0;

  for (const media of mediaFiles) {
    if (media.type === "photo") {
      // For photos, just convert to base64
      const base64 = await imageFileToBase64(media.url);
      allFrames.push({
        sourceFileId: media.id,
        sourceFileName: media.name,
        sourceType: "photo",
        timestamp: 0,
        base64,
      });
    } else {
      // For videos, extract frames at intervals
      const videoFrames = await extractFrames(
        media.url,
        media.duration,
        (pct) => {
          // Map individual video progress into overall progress
          const fileProgress = (completedFiles + pct / 100) / mediaFiles.length;
          onProgress?.(fileProgress * 100);
        }
      );

      for (const frame of videoFrames) {
        allFrames.push({
          sourceFileId: media.id,
          sourceFileName: media.name,
          sourceType: "video",
          timestamp: frame.timestamp,
          base64: frame.base64,
        });
      }
    }

    completedFiles++;
    onProgress?.((completedFiles / mediaFiles.length) * 100);
  }

  return allFrames;
}

/**
 * Convert an image URL (object URL) to base64 JPEG.
 */
async function imageFileToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Scale down to 480p height for consistency
      const scale = Math.min(1, 480 / img.height);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
      resolve(base64);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}
