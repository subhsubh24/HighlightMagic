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
};

export const ALL_FILTERS: VideoFilter[] = ["None", "Vibrant", "Warm", "Cool", "Noir", "Fade"];
