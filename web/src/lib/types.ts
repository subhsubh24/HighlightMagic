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

export type AnimationStatus = "idle" | "generating" | "completed" | "failed";

export type AiMusicStatus = "idle" | "generating" | "completed" | "failed";

export interface MediaFile {
  id: string;
  file: File;
  url: string;
  type: MediaType;
  duration: number; // 0 for photos
  name: string;
  thumbnailUrl?: string;
  // Photo animation (Kling 3.0 via Atlas Cloud)
  animatePhoto?: boolean;
  animationInstructions?: string;
  animatedVideoUrl?: string | null;
  animationStatus?: AnimationStatus;
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
  // Per-clip style overrides (AI-decided, user-overridable)
  // When present, these take priority over theme defaults in rendering
  transitionType?: string;   // e.g. "flash", "zoom_punch", "crossfade"
  transitionDuration?: number; // seconds (overrides theme default)
  entryPunchScale?: number;    // 1.0 = no punch, 1.05 = pop
  entryPunchDuration?: number; // seconds for the punch animation (0.1-0.3)
  kenBurnsIntensity?: number;  // 0-0.08 for photos
  // Dynamic AI-authored styles — when present, override named presets/filters
  /** Custom velocity keyframes from AI — [{position: 0-1, speed: 0.25-4.0}] */
  customVelocityKeyframes?: Array<{ position: number; speed: number }>;
  /** Custom CSS filter string from AI — e.g. "saturate(1.3) contrast(1.2) brightness(1.05)" */
  customFilterCSS?: string;
  // Dynamic AI-authored caption styling
  /** Custom caption font weight (100-900). Overrides style default. */
  customCaptionFontWeight?: number;
  /** Custom caption font style: 'normal' or 'italic'. */
  customCaptionFontStyle?: string;
  /** Custom caption font family: 'sans-serif', 'serif', or 'mono'. */
  customCaptionFontFamily?: string;
  /** Custom caption text color as hex (e.g. "#ffffff"). */
  customCaptionColor?: string;
  /** Custom caption entrance animation: 'pop', 'slide', 'flicker', 'typewriter', 'fade', 'none'. */
  customCaptionAnimation?: string;
  /** Custom caption glow color as hex (e.g. "#7c3aed"). Empty = no glow. */
  customCaptionGlowColor?: string;
  /** Custom caption glow radius in pixels (0-30). */
  customCaptionGlowRadius?: number;
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
  // Regeneration — when set, detecting step skips scoring and re-runs planner with this feedback
  regenerateFeedback: string | null;
  // Creative direction — optional user-provided style instructions passed to Opus planner
  creativeDirection: string;
  // AI-generated music (Suno V4.5-All) — opt-in, Pro only
  aiMusicEnabled: boolean;
  aiMusicStatus: AiMusicStatus;
  aiMusicTaskId: string | null;
  aiMusicUrl: string | null;
  aiMusicPrompt: string;
}
