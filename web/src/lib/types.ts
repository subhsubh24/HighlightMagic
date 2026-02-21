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

export type VideoFilter = "None" | "Vibrant" | "Warm" | "Cool" | "Noir" | "Fade";

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

export interface HighlightSegment {
  id: string;
  startTime: number; // seconds
  endTime: number;
  confidenceScore: number;
  label: string;
  detectionSources: string[];
}

export interface EditedClip {
  id: string;
  segment: HighlightSegment;
  trimStart: number;
  trimEnd: number;
  selectedMusicTrack: MusicTrack | null;
  captionText: string;
  captionStyle: CaptionStyle;
  selectedFilter: VideoFilter;
}

export interface FrameAnalysis {
  timestamp: number;
  score: number;
  label: string;
  reasoning: string;
}

// ── App state ──

export type AppStep = "upload" | "detecting" | "results" | "editor" | "export";

export interface AppState {
  step: AppStep;
  videoFile: File | null;
  videoUrl: string | null;
  videoDuration: number;
  selectedTemplate: HighlightTemplate | null;
  highlights: HighlightSegment[];
  clips: EditedClip[];
  activeClipId: string | null;
  isProUser: boolean;
  exportsUsed: number;
}
