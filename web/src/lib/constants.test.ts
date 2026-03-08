import { describe, it, expect } from "vitest";
import {
  MAX_VIDEO_DURATION_SECONDS,
  MAX_UPLOAD_SIZE_MB,
  MAX_FILES,
  MAX_TOTAL_DURATION_SECONDS,
  PHOTO_DISPLAY_DURATION,
  FREE_EXPORT_LIMIT,
  MAX_CLIP_DURATION,
  EXPORT_WIDTH,
  EXPORT_HEIGHT,
  EXPORT_FRAME_RATE,
  TRANSITION_DURATION,
  WATERMARK_TEXT,
  WATERMARK_OPACITY,
  FRAME_SAMPLE_INTERVAL_SECONDS,
  MAX_FRAMES_PER_BATCH,
  LOOP_CROSSFADE_DURATION,
  EXPORT_BITRATE,
  BEAT_SYNC_TOLERANCE_MS,
} from "./constants";

describe("constants", () => {
  it("has valid video duration limits", () => {
    expect(MAX_VIDEO_DURATION_SECONDS).toBe(600);
    expect(MAX_TOTAL_DURATION_SECONDS).toBe(1800);
    expect(MAX_CLIP_DURATION).toBe(60);
  });

  it("has valid upload limits", () => {
    expect(MAX_UPLOAD_SIZE_MB).toBe(500);
    expect(MAX_FILES).toBe(20);
  });

  it("has valid export dimensions", () => {
    expect(EXPORT_WIDTH).toBe(1080);
    expect(EXPORT_HEIGHT).toBe(1920);
    expect(EXPORT_FRAME_RATE).toBe(30);
    expect(EXPORT_BITRATE).toBe(12_000_000);
  });

  it("has valid timing constants", () => {
    expect(PHOTO_DISPLAY_DURATION).toBe(3);
    expect(TRANSITION_DURATION).toBe(0.3);
    expect(LOOP_CROSSFADE_DURATION).toBe(0.5);
    expect(BEAT_SYNC_TOLERANCE_MS).toBe(50);
  });

  it("has valid frame extraction settings", () => {
    expect(FRAME_SAMPLE_INTERVAL_SECONDS).toBe(1);
    expect(MAX_FRAMES_PER_BATCH).toBe(35);
  });

  it("has valid watermark settings", () => {
    expect(WATERMARK_TEXT).toBe("Highlight Magic");
    expect(WATERMARK_OPACITY).toBe(0.4);
  });

  it("has valid free tier limit", () => {
    expect(FREE_EXPORT_LIMIT).toBe(5);
  });
});
