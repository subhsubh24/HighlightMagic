// ── Types ported from iOS models ──

export type TrackMood = "Upbeat" | "Chill" | "Epic" | "Fun" | "Energetic" | "Dramatic" | "Funny";
export type TrackCategory = "General" | "Adventure" | "Lifestyle" | "Sports" | "Party" | "Cinematic";

export interface MusicTrack {
  id: string;
  name: string;
  fileName: string;
  artist: string;
  mood: TrackMood;
  category: TrackCategory;
  bpm: number;
  durationSeconds: number;
  isPremium: boolean;
}

export type VideoFilter =
  | "None" | "Vibrant" | "Warm" | "Cool" | "Noir" | "Fade"
  // Cinematic LUT-style grades
  | "GoldenHour" | "TealOrange" | "MoodyCinematic" | "CleanAiry" | "VintageFilm";

export type CaptionStyle = "Bold" | "Minimal" | "Neon" | "Classic";

export interface HighlightTemplate {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  description: string;
  suggestedFilter: VideoFilter;
  suggestedCaptionStyle: CaptionStyle;
  suggestedMusicMood: TrackMood;
  colorAccent: string; // hex
}

// ── Multi-file support ──

export type MediaType = "video" | "photo";

export interface MediaFile {
  id: string;
  file: File;
  url: string;
  type: MediaType;
  duration: number; // 0 for photos
  name: string;
  thumbnailUrl?: string;
}

export interface HighlightSegment {
  id: string;
  sourceFileId: string; // which uploaded file this came from
  startTime: number; // seconds (0 for photos)
  endTime: number;
  confidenceScore: number;
  label: string;
  detectionSources: string[];
}

export type VelocityPreset = "normal" | "hero" | "bullet" | "ramp_in" | "ramp_out" | "montage";

export interface EditedClip {
  id: string;
  sourceFileId: string; // which uploaded file this came from
  segment: HighlightSegment;
  trimStart: number;
  trimEnd: number;
  order: number; // position in the final highlight tape
  selectedMusicTrack: MusicTrack | null;
  captionText: string;
  captionStyle: CaptionStyle;
  selectedFilter: VideoFilter;
  velocityPreset: VelocityPreset;
}

export interface ViralExportOptions {
  /** Enable beat-sync: snap cuts to the music's BPM grid. */
  beatSync: boolean;
  /** Enable seamless loop: cross-fade last 0.5s into first 0.5s for TikTok replay. */
  seamlessLoop: boolean;
}

export interface FrameAnalysis {
  timestamp: number;
  score: number;
  label: string;
  reasoning: string;
}

// ── Editing theme (AI-detected or template-derived) ──

export type EditingTheme =
  | "sports"
  | "cooking"
  | "travel"
  | "gaming"
  | "party"
  | "fitness"
  | "pets"
  | "vlog"
  | "wedding"
  | "cinematic";

// ── App state ──

export type AppStep = "upload" | "detecting" | "results" | "editor" | "export";

export interface AppState {
  step: AppStep;
  // Multi-file upload
  mediaFiles: MediaFile[];
  // Legacy single-video compat (points to first video or null)
  videoFile: File | null;
  videoUrl: string | null;
  videoDuration: number;
  selectedTemplate: HighlightTemplate | null;
  detectedTheme: EditingTheme;
  contentSummary: string;
  highlights: HighlightSegment[];
  clips: EditedClip[];
  activeClipId: string | null;
  isProUser: boolean;
  exportsUsed: number;
  // Viral export options
  viralOptions: ViralExportOptions;
}
