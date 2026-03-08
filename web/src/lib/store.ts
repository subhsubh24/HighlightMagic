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
  aiMusicEnabled: true,
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
  // Voice cloning
  voiceSampleUrl: null,
  clonedVoiceId: null,
  voiceCloneStatus: "idle",
  // Stem separation
  instrumentalMusicUrl: null,
  stemSeparationStatus: "idle",
  // Style transfer
  styleTransferPrompt: null,
  // Talking head
  talkingHead: null,
};

// ── Helper: derive legacy single-video fields from mediaFiles ──

function deriveLegacyVideo(mediaFiles: MediaFile[]): Pick<AppState, "videoFile" | "videoUrl" | "videoDuration"> {
  // Prefer actual videos, then fall back to animated photos (photo→video via Kling)
  const firstVideo = mediaFiles.find((f) => f.type === "video");
  if (firstVideo) {
    return { videoFile: firstVideo.file, videoUrl: firstVideo.url, videoDuration: firstVideo.duration };
  }
  const animatedPhoto = mediaFiles.find((f) => f.type === "photo" && f.animationStatus === "completed" && f.animatedVideoUrl);
  if (animatedPhoto) {
    return { videoFile: animatedPhoto.file, videoUrl: animatedPhoto.animatedVideoUrl!, videoDuration: animatedPhoto.duration };
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
  | { type: "REORDER_CLIPS"; fromIndex: number; toIndex: number }
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
  | { type: "SET_INTRO_CARD"; card: GeneratedCard | null }
  | { type: "SET_OUTRO_CARD"; card: GeneratedCard | null }
  | { type: "SET_SFX_TRACKS"; tracks: SfxTrack[] }
  | { type: "SET_SFX_STATUS"; status: GenerationStatus }
  | { type: "UPDATE_SFX_TRACK"; clipIndex: number; audioUrl: string; status: GenerationStatus }
  | { type: "SET_VOICEOVER_SEGMENTS"; segments: VoiceoverSegment[] }
  | { type: "SET_VOICEOVER_STATUS"; status: GenerationStatus }
  | { type: "UPDATE_VOICEOVER_SEGMENT"; clipIndex: number; audioUrl: string; duration: number; status: GenerationStatus }
  | { type: "SET_THUMBNAIL"; thumbnail: GeneratedThumbnail | null }
  | { type: "SET_AUDIO_TRANSCRIPT"; transcript: string }
  // Voice cloning
  | { type: "SET_VOICE_SAMPLE"; url: string | null }
  | { type: "SET_CLONED_VOICE"; voiceId: string | null; status: GenerationStatus }
  // Stem separation
  | { type: "SET_INSTRUMENTAL_MUSIC"; url: string | null; status: GenerationStatus }
  // Style transfer
  | { type: "SET_STYLE_TRANSFER_PROMPT"; prompt: string | null }
  // Talking head
  | { type: "SET_TALKING_HEAD"; talkingHead: AppState["talkingHead"] }
  | { type: "RESET" };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_VIDEO": {
      // Also add to mediaFiles if not already present, for legacy single-video flows
      const alreadyExists = state.mediaFiles.some((f) => f.url === action.url);
      const updatedMedia = alreadyExists ? state.mediaFiles : [
        ...state.mediaFiles,
        { id: action.file.name + "-" + Date.now(), file: action.file, url: action.url, type: "video" as const, name: action.file.name, duration: action.duration },
      ];
      return { ...state, videoFile: action.file, videoUrl: action.url, videoDuration: action.duration, mediaFiles: updatedMedia };
    }
    case "ADD_MEDIA": {
      const updated = [...state.mediaFiles, ...action.files];
      return { ...state, mediaFiles: updated, ...deriveLegacyVideo(updated) };
    }
    case "REMOVE_MEDIA": {
      const updated = state.mediaFiles.filter((f) => f.id !== action.fileId);
      // Schedule URL revocation outside the reducer to avoid side effects during render
      const removed = state.mediaFiles.find((f) => f.id === action.fileId);
      if (removed) setTimeout(() => URL.revokeObjectURL(removed.url), 0);
      return { ...state, mediaFiles: updated, ...deriveLegacyVideo(updated) };
    }
    case "REORDER_MEDIA": {
      const arr = [...state.mediaFiles];
      if (action.fromIndex < 0 || action.fromIndex >= arr.length || action.toIndex < 0 || action.toIndex >= arr.length) {
        console.warn(`[Store] REORDER_MEDIA out of bounds: from=${action.fromIndex} to=${action.toIndex} length=${arr.length}`);
        return state;
      }
      const [item] = arr.splice(action.fromIndex, 1);
      arr.splice(action.toIndex, 0, item);
      return { ...state, mediaFiles: arr, ...deriveLegacyVideo(arr) };
    }
    case "CLEAR_MEDIA": {
      const oldFiles = state.mediaFiles;
      // Schedule URL revocation outside the reducer to avoid side effects during render
      setTimeout(() => oldFiles.forEach((f) => URL.revokeObjectURL(f.url)), 0);
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
    case "SET_CLIPS": {
      // Preserve activeClipId if it still exists in the new clips; otherwise default to first
      const activeStillExists = state.activeClipId && action.clips.some((c) => c.id === state.activeClipId);
      return { ...state, clips: action.clips, activeClipId: activeStillExists ? state.activeClipId : (action.clips[0]?.id ?? null) };
    }
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
      if (action.fromIndex < 0 || action.fromIndex >= arr.length || action.toIndex < 0 || action.toIndex >= arr.length) {
        console.warn(`[Store] REORDER_CLIPS out of bounds: from=${action.fromIndex} to=${action.toIndex} length=${arr.length}`);
        return state;
      }
      const [item] = arr.splice(action.fromIndex, 1);
      arr.splice(action.toIndex, 0, item);
      // Update order field
      const reordered = arr.map((c, i) => ({ ...c, order: i }));
      return { ...state, clips: reordered };
    }
    case "REMOVE_CLIP": {
      const filtered = state.clips.filter((c) => c.id !== action.clipId).map((c, i) => ({ ...c, order: i }));
      // Keep activeClipId if it still exists, otherwise fall back to nearest clip
      const activeStillExists = state.activeClipId && filtered.some((c) => c.id === state.activeClipId);
      return {
        ...state,
        clips: filtered,
        activeClipId: activeStillExists ? state.activeClipId : (filtered[0]?.id ?? null),
      };
    }
    case "INCREMENT_EXPORTS":
      return { ...state, exportsUsed: state.exportsUsed + 1 };
    case "SET_VIRAL_OPTIONS":
      return { ...state, viralOptions: { ...state.viralOptions, ...action.options } };
    case "SET_REGENERATE_FEEDBACK":
      // Clear pipeline state when starting regeneration so stale data doesn't mix with fresh results
      return {
        ...state,
        regenerateFeedback: action.feedback,
        ...(action.feedback ? {
          aiProductionPlan: null,
          introCard: null,
          outroCard: null,
          sfxTracks: [],
          sfxStatus: "idle" as const,
          voiceoverSegments: [],
          voiceoverStatus: "idle" as const,
          aiMusicStatus: "idle" as const,
          aiMusicUrl: null,
        } : {}),
      };
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
      return {
        ...state,
        aiMusicStatus: action.status,
        aiMusicUrl: action.status === "failed" ? null : (action.audioUrl ?? state.aiMusicUrl),
      };
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
    case "SET_VOICE_SAMPLE":
      return { ...state, voiceSampleUrl: action.url };
    case "SET_CLONED_VOICE":
      return { ...state, clonedVoiceId: action.voiceId, voiceCloneStatus: action.status };
    case "SET_INSTRUMENTAL_MUSIC":
      return { ...state, instrumentalMusicUrl: action.url, stemSeparationStatus: action.status };
    case "SET_STYLE_TRANSFER_PROMPT":
      return { ...state, styleTransferPrompt: action.prompt };
    case "SET_TALKING_HEAD":
      return { ...state, talkingHead: action.talkingHead };
    case "RESET": {
      // Schedule URL revocation outside the reducer to avoid side effects during render
      const filesToRevoke = state.mediaFiles;
      const aiMusicToRevoke = state.aiMusicUrl;
      setTimeout(() => {
        filesToRevoke.forEach((f) => {
          URL.revokeObjectURL(f.url);
          if (f.animatedVideoUrl) URL.revokeObjectURL(f.animatedVideoUrl);
        });
        if (aiMusicToRevoke) URL.revokeObjectURL(aiMusicToRevoke);
      }, 0);
      return {
        ...initialState,
        isProUser: state.isProUser,
        exportsUsed: state.exportsUsed,
      };
    }
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
