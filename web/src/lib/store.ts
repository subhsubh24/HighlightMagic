"use client";

import { createContext, useContext } from "react";
import type { AppState, AnimationStatus, AppStep, EditedClip, EditingTheme, HighlightSegment, HighlightTemplate, MediaFile, MusicTrack, VideoFilter, CaptionStyle, ViralExportOptions } from "./types";
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
    case "RESET":
      state.mediaFiles.forEach((f) => URL.revokeObjectURL(f.url));
      return { ...initialState, isProUser: state.isProUser, exportsUsed: state.exportsUsed, detectedTheme: "cinematic" as const, contentSummary: "" };
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
