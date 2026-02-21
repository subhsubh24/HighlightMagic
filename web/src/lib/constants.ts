// ── Constants ported from iOS Constants.swift ──

export const MAX_VIDEO_DURATION_SECONDS = 600; // 10 minutes
export const MAX_UPLOAD_SIZE_MB = 500;
export const FREE_EXPORT_LIMIT = 5;
export const MIN_CLIP_DURATION = 15;
export const MAX_CLIP_DURATION = 60;
export const TARGET_CLIP_COUNT = 3;
export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1920;
export const EXPORT_FRAME_RATE = 30;
export const HIGHLIGHT_CONFIDENCE_THRESHOLD = 0.6;
export const WATERMARK_TEXT = "Highlight Magic";
export const WATERMARK_OPACITY = 0.4;

export const FRAME_SAMPLE_INTERVAL_SECONDS = 2; // Extract 1 frame per 2s for analysis
export const MAX_FRAMES_PER_BATCH = 10; // Claude Vision batch limit

export const IOS_APP_STORE_URL =
  process.env.NEXT_PUBLIC_IOS_APP_STORE_URL ??
  "https://apps.apple.com/app/highlight-magic/id0000000000";
