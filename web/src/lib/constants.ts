// ── Constants ported from iOS Constants.swift ──

export const MAX_VIDEO_DURATION_SECONDS = 600; // 10 minutes
export const MAX_UPLOAD_SIZE_MB = 500;
export const MAX_FILES = 20; // max clips/photos per project
export const MAX_TOTAL_DURATION_SECONDS = 1800; // 30 min total across all clips
export const PHOTO_DISPLAY_DURATION = 3; // seconds a photo shows in the final edit
export const FREE_EXPORT_LIMIT = 5;
export const MAX_CLIP_DURATION = 60;
export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1920;
export const EXPORT_FRAME_RATE = 30;
export const TRANSITION_DURATION = 0.3; // seconds — theme default, AI overrides per-clip
export const WATERMARK_TEXT = "Highlight Magic";
export const WATERMARK_OPACITY = 0.4;

export const FRAME_SAMPLE_INTERVAL_SECONDS = 1; // Extract 1 frame per second — miss nothing
export const MAX_FRAMES_PER_BATCH = 30; // 30 frames/batch — balances temporal context with per-batch latency

// ── Viral features ──
export const LOOP_CROSSFADE_DURATION = 0.5; // seconds of crossfade for seamless loop
export const EXPORT_BITRATE = 12_000_000; // 12 Mbps (optimized for platform compression)
export const BEAT_SYNC_TOLERANCE_MS = 50; // max ms off-beat before snapping

export const IOS_APP_STORE_URL =
  process.env.NEXT_PUBLIC_IOS_APP_STORE_URL ??
  "https://apps.apple.com/app/highlight-magic/id0000000000";
