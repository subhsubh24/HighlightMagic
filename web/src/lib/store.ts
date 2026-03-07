"use client";

import { createContext, useContext } from "react";
import type { AppState, AiMusicStatus, AiProductionPlan, AnimationStatus, AppStep, EditedClip, EditingTheme, GeneratedCard, GeneratedThumbnail, GenerationStatus, HighlightSegment, HighlightTemplate, MediaFile, MusicTrack, SfxTrack, VideoFilter, CaptionStyle, ViralExportOptions, VoiceoverSegment } from "./types";
import { FREE_EXPORT_LIMIT } from "./constants";

// ── Initial state ──

export const initialState: AppState = {
  step: "upload",
  mediaFiles: [],
  videoFile: null,
  videoUrl: null,
  videoDuration: 0,
  selectedTemplate: null,
  detectedTheme: "cinematic",
  contentSummary: "",
  highlights: [],
  clips: [],
  activeClipId: null,
  isProUser: false,
  exportsUsed: 0,
  viralOptions: { beatSync: true, seamlessLoop: false },
  regenerateFeedback: null,
  creativeDirection: "",
  aiMusicEnabled: false,
  aiMusicStatus: "idle",
  aiMusicUrl: null,
  aiMusicPrompt: "",
  // AI Production pipeline
  aiProductionPlan: null,
  introCard: null,
  outroCard: null,
  sfxTracks: [],
  sfxStatus: "idle",
  voiceoverSegments: [],
  voiceoverStatus: "idle",
  thumbnail: null,
  audioTranscript: null,
};

// ── Helper: derive legacy single-video fields from mediaFiles ──

function deriveLegacyVideo(mediaFiles: MediaFile[]): Pick<AppState, "videoFile" | "videoUrl" | "videoDuration"> {
  const firstVideo = mediaFiles.find((f) => f.type === "video");
  if (firstVideo) {
    return { videoFile: firstVideo.file, videoUrl: firstVideo.url, videoDuration: firstVideo.duration };
  }
  return { videoFile: null, videoUrl: null, videoDuration: 0 };
}

// ── Actions ──

export type Action =
  | { type: "SET_STEP"; step: AppStep }
  | { type: "SET_VIDEO"; file: File; url: string; duration: number }
  | { type: "ADD_MEDIA"; files: MediaFile[] }
  | { type: "REMOVE_MEDIA"; fileId: string }
  | { type: "REORDER_MEDIA"; fromIndex: number; toIndex: number }
  | { type: "CLEAR_MEDIA" }
  | { type: "SET_TEMPLATE"; template: HighlightTemplate | null }
  | { type: "SET_THEME"; theme: EditingTheme }
  | { type: "SET_CONTENT_SUMMARY"; summary: string }
  | { type: "SET_HIGHLIGHTS"; highlights: HighlightSegment[] }
  | { type: "SET_CLIPS"; clips: EditedClip[] }
  | { type: "SET_ACTIVE_CLIP"; clipId: string }
  | { type: "UPDATE_CLIP"; clipId: string; updates: Partial<EditedClip> }
  | { type: "REORDER_CLIPS"; fromIndex: number; toIndex: number; clipId?: string; targetClipId?: string }
  | { type: "REMOVE_CLIP"; clipId: string }
  | { type: "INCREMENT_EXPORTS" }
  | { type: "SET_VIRAL_OPTIONS"; options: Partial<ViralExportOptions> }
  | { type: "SET_REGENERATE_FEEDBACK"; feedback: string | null }
  | { type: "SET_CREATIVE_DIRECTION"; direction: string }
  | { type: "UPDATE_MEDIA_ANIMATION"; fileId: string; animatePhoto: boolean; animationInstructions: string }
  | { type: "SET_ANIMATION_RESULT"; fileId: string; animatedVideoUrl: string | null; animationStatus: AnimationStatus }
  | { type: "SET_AI_MUSIC_ENABLED"; enabled: boolean }
  | { type: "SET_AI_MUSIC_PROMPT"; prompt: string }
  | { type: "SET_AI_MUSIC_RESULT"; status: AiMusicStatus; audioUrl?: string | null }
  // ── AI Production pipeline actions ──
  | { type: "SET_AI_PRODUCTION_PLAN"; plan: AiProductionPlan }
  | { type: "SET_INTRO_CARD"; card: GeneratedCard }
  | { type: "SET_OUTRO_CARD"; card: GeneratedCard }
  | { type: "SET_SFX_TRACKS"; tracks: SfxTrack[] }
  | { type: "SET_SFX_STATUS"; status: GenerationStatus }
  | { type: "UPDATE_SFX_TRACK"; clipIndex: number; audioUrl: string; status: GenerationStatus }
  | { type: "SET_VOICEOVER_SEGMENTS"; segments: VoiceoverSegment[] }
  | { type: "SET_VOICEOVER_STATUS"; status: GenerationStatus }
  | { type: "UPDATE_VOICEOVER_SEGMENT"; clipIndex: number; audioUrl: string; duration: number; status: GenerationStatus }
  | { type: "SET_THUMBNAIL"; thumbnail: GeneratedThumbnail }
  | { type: "SET_AUDIO_TRANSCRIPT"; transcript: string }
  | { type: "RESET" };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_VIDEO":
      return { ...state, videoFile: action.file, videoUrl: action.url, videoDuration: action.duration };
    case "ADD_MEDIA": {
      const updated = [...state.mediaFiles, ...action.files];
      return { ...state, mediaFiles: updated, ...deriveLegacyVideo(updated) };
    }
    case "REMOVE_MEDIA": {
      const updated = state.mediaFiles.filter((f) => f.id !== action.fileId);
      // Revoke the old URL
      const removed = state.mediaFiles.find((f) => f.id === action.fileId);
      if (removed) URL.revokeObjectURL(removed.url);
      return { ...state, mediaFiles: updated, ...deriveLegacyVideo(updated) };
    }
    case "REORDER_MEDIA": {
      const arr = [...state.mediaFiles];
      const [item] = arr.splice(action.fromIndex, 1);
      arr.splice(action.toIndex, 0, item);
      return { ...state, mediaFiles: arr, ...deriveLegacyVideo(arr) };
    }
    case "CLEAR_MEDIA": {
      state.mediaFiles.forEach((f) => URL.revokeObjectURL(f.url));
      return { ...state, mediaFiles: [], videoFile: null, videoUrl: null, videoDuration: 0 };
    }
    case "SET_TEMPLATE":
      return { ...state, selectedTemplate: action.template };
    case "SET_THEME":
      return { ...state, detectedTheme: action.theme };
    case "SET_CONTENT_SUMMARY":
      return { ...state, contentSummary: action.summary };
    case "SET_HIGHLIGHTS":
      return { ...state, highlights: action.highlights };
    case "SET_CLIPS":
      return { ...state, clips: action.clips, activeClipId: action.clips[0]?.id ?? null };
    case "SET_ACTIVE_CLIP":
      return { ...state, activeClipId: action.clipId };
    case "UPDATE_CLIP":
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.clipId ? { ...c, ...action.updates } : c
        ),
      };
    case "REORDER_CLIPS": {
      // Sort by order first so indices match the visual (sorted) order
      const arr = [...state.clips].sort((a, b) => a.order - b.order);
      const [item] = arr.splice(action.fromIndex, 1);
      arr.splice(action.toIndex, 0, item);
      // Update order field
      const reordered = arr.map((c, i) => ({ ...c, order: i }));
      return { ...state, clips: reordered };
    }
    case "REMOVE_CLIP": {
      const filtered = state.clips.filter((c) => c.id !== action.clipId).map((c, i) => ({ ...c, order: i }));
      return {
        ...state,
        clips: filtered,
        activeClipId: filtered[0]?.id ?? null,
      };
    }
    case "INCREMENT_EXPORTS":
      return { ...state, exportsUsed: state.exportsUsed + 1 };
    case "SET_VIRAL_OPTIONS":
      return { ...state, viralOptions: { ...state.viralOptions, ...action.options } };
    case "SET_REGENERATE_FEEDBACK":
      return { ...state, regenerateFeedback: action.feedback };
    case "SET_CREATIVE_DIRECTION":
      return { ...state, creativeDirection: action.direction };
    case "UPDATE_MEDIA_ANIMATION": {
      const updated = state.mediaFiles.map((f) =>
        f.id === action.fileId
          ? { ...f, animatePhoto: action.animatePhoto, animationInstructions: action.animationInstructions }
          : f
      );
      return { ...state, mediaFiles: updated };
    }
    case "SET_ANIMATION_RESULT": {
      const updated = state.mediaFiles.map((f) =>
        f.id === action.fileId
          ? { ...f, animatedVideoUrl: action.animatedVideoUrl, animationStatus: action.animationStatus }
          : f
      );
      return { ...state, mediaFiles: updated, ...deriveLegacyVideo(updated) };
    }
    case "SET_AI_MUSIC_ENABLED":
      return {
        ...state,
        aiMusicEnabled: action.enabled,
        // Reset music state when toggling off
        ...(action.enabled ? {} : { aiMusicStatus: "idle" as const, aiMusicUrl: null }),
      };
    case "SET_AI_MUSIC_PROMPT":
      return { ...state, aiMusicPrompt: action.prompt };
    case "SET_AI_MUSIC_RESULT":
      return { ...state, aiMusicStatus: action.status, aiMusicUrl: action.audioUrl ?? state.aiMusicUrl };
    // ── AI Production pipeline ──
    case "SET_AI_PRODUCTION_PLAN":
      return { ...state, aiProductionPlan: action.plan };
    case "SET_INTRO_CARD":
      return { ...state, introCard: action.card };
    case "SET_OUTRO_CARD":
      return { ...state, outroCard: action.card };
    case "SET_SFX_TRACKS":
      return { ...state, sfxTracks: action.tracks };
    case "SET_SFX_STATUS":
      return { ...state, sfxStatus: action.status };
    case "UPDATE_SFX_TRACK":
      return {
        ...state,
        sfxTracks: state.sfxTracks.map((t) =>
          t.clipIndex === action.clipIndex ? { ...t, audioUrl: action.audioUrl, status: action.status } : t
        ),
      };
    case "SET_VOICEOVER_SEGMENTS":
      return { ...state, voiceoverSegments: action.segments };
    case "SET_VOICEOVER_STATUS":
      return { ...state, voiceoverStatus: action.status };
    case "UPDATE_VOICEOVER_SEGMENT":
      return {
        ...state,
        voiceoverSegments: state.voiceoverSegments.map((s) =>
          s.clipIndex === action.clipIndex
            ? { ...s, audioUrl: action.audioUrl, duration: action.duration, status: action.status }
            : s
        ),
      };
    case "SET_THUMBNAIL":
      return { ...state, thumbnail: action.thumbnail };
    case "SET_AUDIO_TRANSCRIPT":
      return { ...state, audioTranscript: action.transcript };
    case "RESET":
      state.mediaFiles.forEach((f) => URL.revokeObjectURL(f.url));
      return {
        ...initialState,
        isProUser: state.isProUser,
        exportsUsed: state.exportsUsed,
        detectedTheme: "cinematic" as const,
        contentSummary: "",
      };
    default:
      return state;
  }
}

export function canExportFree(state: AppState): boolean {
  return state.exportsUsed < FREE_EXPORT_LIMIT;
}

// ── Helpers ──

export function getMediaFile(state: AppState, fileId: string): MediaFile | undefined {
  return state.mediaFiles.find((f) => f.id === fileId);
}

export function getTotalDuration(state: AppState): number {
  return state.mediaFiles.reduce((sum, f) => sum + f.duration, 0);
}

// ── Context ──

export const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
}>({ state: initialState, dispatch: () => {} });

export function useApp() {
  return useContext(AppContext);
}
