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

/** Generic async generation status — used for SFX, voiceover, intro, outro, thumbnail */
export type GenerationStatus = "idle" | "generating" | "completed" | "failed";

// ── AI Production types (auto-pilot pipeline) ──

/** Sound effect mapped to a specific clip transition or accent moment */
export interface SfxTrack {
  clipIndex: number;
  timing: "before" | "on" | "after";
  prompt: string;
  durationMs: number;
  audioUrl?: string;
  status: GenerationStatus;
}

/** Voiceover segment timed to a specific clip */
export interface VoiceoverSegment {
  clipIndex: number;
  text: string;
  audioUrl?: string;
  /** Duration in seconds — 0 until audio is generated */
  duration: number;
  status: GenerationStatus;
}

/** AI-generated intro or outro video card */
export interface GeneratedCard {
  text: string;
  stylePrompt: string;
  videoUrl?: string;
  /** AI-decided duration in seconds (3-5s range) */
  duration: number;
  status: GenerationStatus;
}

/** Thumbnail generation result */
export interface GeneratedThumbnail {
  sourceClipIndex: number;
  frameTime: number;
  stylePrompt: string;
  imageUrl?: string;
  status: GenerationStatus;
}

/** Claude's expanded plan output — drives the entire AI autopilot pipeline */
export interface AiProductionPlan {
  // Intro/outro cards
  intro: { text: string; stylePrompt: string; duration: number } | null;
  outro: { text: string; stylePrompt: string; duration: number } | null;

  // Sound effects
  sfx: Array<{
    clipIndex: number;
    timing: "before" | "on" | "after";
    prompt: string;
    durationMs: number;
  }>;

  // Voiceover
  voiceover: {
    enabled: boolean;
    segments: Array<{ clipIndex: number; text: string }>;
    voiceCharacter: string;
    /** AI-decided delay in seconds before voiceover starts after clip begins (0-1s) */
    delaySec: number;
  };

  // Music
  musicPrompt: string;
  musicDurationMs: number;

  // Audio mix — AI-decided volume levels (0-1)
  musicVolume: number;
  sfxVolume: number;
  voiceoverVolume: number;

  /** AI-decided default transition duration for clips that don't specify one */
  defaultTransitionDuration: number;

  // Timing & pacing
  /** AI-decided photo display duration in seconds (2-8s) */
  photoDisplayDuration: number;
  /** AI-decided loop crossfade duration in seconds (0.2-1.5s) */
  loopCrossfadeDuration: number;
  /** AI-decided caption entrance animation duration in seconds (0.2-1.0s) */
  captionEntranceDuration: number;
  /** AI-decided caption exit animation duration in seconds (0.1-0.5s) */
  captionExitDuration: number;
  /** AI-decided music ducking ratio during voiceover (0.1-0.6) */
  musicDuckRatio: number;
  /** AI-decided beat-sync tolerance in ms (20-200ms) */
  beatSyncToleranceMs: number;
  /** AI-decided export bitrate in bps */
  exportBitrate: number;
  /** AI-decided watermark opacity (0.1-0.6) */
  watermarkOpacity: number;
  /** AI-decided neon transition colors as hex array */
  neonColors: string[];

  // ── Rendering fine-tuning (AI full creative control) ──

  /** Beat pulse scale multiplier (0 = no pulse, 0.015 = subtle, 0.04 = pronounced) */
  beatPulseIntensity?: number;
  /** Beat flash overlay max opacity (0 = none, 0.12 = subtle, 0.3 = punchy) */
  beatFlashOpacity?: number;

  /** Caption font size as fraction of canvas height (0.02 = small, 0.025 = default, 0.04 = large) */
  captionFontSize?: number;
  /** Caption vertical position as fraction of canvas height (0.5 = center, 0.89 = bottom, 0.15 = top) */
  captionVerticalPosition?: number;
  /** Caption drop shadow color (CSS color string) */
  captionShadowColor?: string;
  /** Caption drop shadow blur in pixels */
  captionShadowBlur?: number;

  /** Flash transition overlay opacity (0-1). Default 0.85. */
  flashOverlayAlpha?: number;
  /** Zoom punch flash overlay opacity (0-1). Default 0.35. */
  zoomPunchFlashAlpha?: number;
  /** Color flash overlay opacity (0-1). Default 0.65. */
  colorFlashAlpha?: number;
  /** Strobe flash count per transition (2-8). Default 4. */
  strobeFlashCount?: number;
  /** Strobe flash opacity (0-1). Default 0.9. */
  strobeFlashAlpha?: number;
  /** Light leak tint color as hex (default warm gold "#ffc864"). */
  lightLeakColor?: string;
  /** Glitch channel colors as [primary hex, secondary hex] (default red/cyan). */
  glitchColors?: [string, string];

  // Thumbnail
  thumbnail: {
    sourceClipIndex: number;
    frameTime: number;
    stylePrompt: string;
  } | null;

  // Enhanced photo animation prompts (Claude improves user's vague instructions)
  photoAnimationPrompts: Record<string, string>;

  // Style transfer — AI-chosen visual post-processing look
  styleTransfer: {
    prompt: string;
    strength: number; // 0.1-1.0
  } | null;

  // Talking head intro — Claude writes the intro speech
  talkingHeadSpeech: string | null;
}

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
  // AI-generated music (ElevenLabs Eleven Music) — opt-in, Pro only
  aiMusicEnabled: boolean;
  aiMusicStatus: AiMusicStatus;
  aiMusicUrl: string | null;
  aiMusicPrompt: string;

  // ── AI Production pipeline state (auto-pilot) ──

  /** Claude's expanded creative plan — drives all downstream generation */
  aiProductionPlan: AiProductionPlan | null;

  // Intro/outro video cards (Atlas Cloud T2V)
  introCard: GeneratedCard | null;
  outroCard: GeneratedCard | null;

  // Sound effects (ElevenLabs SFX v2)
  sfxTracks: SfxTrack[];
  sfxStatus: GenerationStatus;

  // Voiceover segments (ElevenLabs TTS v3)
  voiceoverSegments: VoiceoverSegment[];
  voiceoverStatus: GenerationStatus;

  // Auto-generated thumbnail (Atlas Cloud BG remove + image gen)
  thumbnail: GeneratedThumbnail | null;

  // Audio transcript from Scribe (enhances detection)
  audioTranscript: string | null;

  // ── Voice cloning (Pro) ──
  /** Base64 data URI of the voice sample uploaded by user */
  voiceSampleUrl: string | null;
  /** ElevenLabs voice ID after cloning */
  clonedVoiceId: string | null;
  voiceCloneStatus: GenerationStatus;

  // ── Stem separation (Pro) — instrumental-only track for ducking under voiceover ──
  instrumentalMusicUrl: string | null;
  stemSeparationStatus: GenerationStatus;

  // ── Style transfer (Pro) — visual post-processing ──
  /** AI-chosen style prompt for the final tape look */
  styleTransferPrompt: string | null;

  // ── Talking head intro (Pro) — lip-sync video from photo + voice ──
  talkingHead: {
    /** Source photo (data URI) */
    photoUrl: string | null;
    /** Intro speech text (AI-generated or user-provided) */
    speechText: string | null;
    /** Generated video URL */
    videoUrl: string | null;
    status: GenerationStatus;
  } | null;
}
