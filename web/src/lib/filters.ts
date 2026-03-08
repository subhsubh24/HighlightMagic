import type { VideoFilter } from "./types";

// ── CSS filter equivalents for iOS CIFilters ──
// Applied via CSS `filter` property on <video>/<canvas> elements

export const VIDEO_FILTERS: Record<VideoFilter, string> = {
  None: "none",
  Vibrant: "saturate(1.4) contrast(1.1)",
  Warm: "sepia(0.2) saturate(1.2) brightness(1.05)",
  Cool: "saturate(0.9) brightness(1.05) hue-rotate(15deg)",
  Noir: "grayscale(1) contrast(1.3)",
  Fade: "contrast(0.9) brightness(1.1) saturate(0.8)",
  // ── Cinematic LUT-style grades ──
  // These simulate the most viral color grading styles from TikTok/Reels.
  // Applied at ~50-70% intensity via CSS filters to keep skin tones natural.
  GoldenHour: "sepia(0.15) saturate(1.35) brightness(1.08) contrast(1.05) hue-rotate(-5deg)",
  TealOrange: "sepia(0.15) saturate(1.4) contrast(1.2) brightness(1.02) hue-rotate(-15deg)",
  MoodyCinematic: "saturate(0.85) contrast(1.35) brightness(0.92)",
  CleanAiry: "brightness(1.12) contrast(0.92) saturate(1.15)",
  VintageFilm: "sepia(0.25) saturate(0.9) contrast(1.1) brightness(1.05)",
};

export const ALL_FILTERS: VideoFilter[] = [
  "None",
  "Vibrant",
  "Warm",
  "Cool",
  "Noir",
  "Fade",
  "GoldenHour",
  "TealOrange",
  "MoodyCinematic",
  "CleanAiry",
  "VintageFilm",
];

