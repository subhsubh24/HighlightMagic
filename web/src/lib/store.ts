"use client";

import { createContext, useContext } from "react";
import type { AppState, AppStep, EditedClip, HighlightSegment, HighlightTemplate, MusicTrack, VideoFilter, CaptionStyle } from "./types";
import { FREE_EXPORT_LIMIT } from "./constants";

// ── Initial state ──

export const initialState: AppState = {
  step: "upload",
  videoFile: null,
  videoUrl: null,
  videoDuration: 0,
  selectedTemplate: null,
  highlights: [],
  clips: [],
  activeClipId: null,
  isProUser: false,
  exportsUsed: 0,
};

// ── Actions ──

export type Action =
  | { type: "SET_STEP"; step: AppStep }
  | { type: "SET_VIDEO"; file: File; url: string; duration: number }
  | { type: "SET_TEMPLATE"; template: HighlightTemplate | null }
  | { type: "SET_HIGHLIGHTS"; highlights: HighlightSegment[] }
  | { type: "SET_CLIPS"; clips: EditedClip[] }
  | { type: "SET_ACTIVE_CLIP"; clipId: string }
  | { type: "UPDATE_CLIP"; clipId: string; updates: Partial<EditedClip> }
  | { type: "INCREMENT_EXPORTS" }
  | { type: "RESET" };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_VIDEO":
      return { ...state, videoFile: action.file, videoUrl: action.url, videoDuration: action.duration };
    case "SET_TEMPLATE":
      return { ...state, selectedTemplate: action.template };
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
    case "INCREMENT_EXPORTS":
      return { ...state, exportsUsed: state.exportsUsed + 1 };
    case "RESET":
      return { ...initialState, isProUser: state.isProUser, exportsUsed: state.exportsUsed };
    default:
      return state;
  }
}

export function canExportFree(state: AppState): boolean {
  return state.exportsUsed < FREE_EXPORT_LIMIT;
}

// ── Context ──

export const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
}>({ state: initialState, dispatch: () => {} });

export function useApp() {
  return useContext(AppContext);
}
