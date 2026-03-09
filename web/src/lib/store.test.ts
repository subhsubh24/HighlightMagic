import { describe, it, expect, vi } from "vitest";
import { reducer, initialState, canExportFree, getMediaFile } from "./store";
import type { AppState, MediaFile } from "./types";

// Mock URL.revokeObjectURL since it's not available in test env
vi.stubGlobal("URL", { ...URL, revokeObjectURL: vi.fn() });

function makeMediaFile(overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id: "test-1",
    file: new File([], "test.mp4"),
    url: "blob:test",
    type: "video",
    duration: 30,
    width: 1920,
    height: 1080,
    name: "test.mp4",
    animatePhoto: false,
    animationInstructions: "",
    animatedVideoUrl: null,
    animationStatus: "idle",
    ...overrides,
  } as MediaFile;
}

describe("reducer", () => {
  it("SET_STEP changes step", () => {
    const state = reducer(initialState, { type: "SET_STEP", step: "detecting" });
    expect(state.step).toBe("detecting");
  });

  it("SET_TEMPLATE sets the template", () => {
    const template = { id: "adventure", name: "Adventure" } as AppState["selectedTemplate"];
    const state = reducer(initialState, { type: "SET_TEMPLATE", template });
    expect(state.selectedTemplate?.id).toBe("adventure");
  });

  it("ADD_MEDIA adds files and derives video fields", () => {
    const file = makeMediaFile();
    const state = reducer(initialState, { type: "ADD_MEDIA", files: [file] });
    expect(state.mediaFiles).toHaveLength(1);
    expect(state.videoDuration).toBe(30);
  });

  it("REMOVE_MEDIA removes file by id", () => {
    const file = makeMediaFile({ id: "file-1" });
    let state = reducer(initialState, { type: "ADD_MEDIA", files: [file] });
    state = reducer(state, { type: "REMOVE_MEDIA", fileId: "file-1" });
    expect(state.mediaFiles).toHaveLength(0);
  });

  it("SET_CLIPS sets clips and activates first", () => {
    const clips = [
      { id: "c1", order: 0 },
      { id: "c2", order: 1 },
    ] as AppState["clips"];
    const state = reducer(initialState, { type: "SET_CLIPS", clips });
    expect(state.clips).toHaveLength(2);
    expect(state.activeClipId).toBe("c1");
  });

  it("REMOVE_CLIP removes and reorders", () => {
    const clips = [
      { id: "c1", order: 0 },
      { id: "c2", order: 1 },
    ] as AppState["clips"];
    let state = reducer(initialState, { type: "SET_CLIPS", clips });
    state = reducer(state, { type: "REMOVE_CLIP", clipId: "c1" });
    expect(state.clips).toHaveLength(1);
    expect(state.clips[0].id).toBe("c2");
    expect(state.clips[0].order).toBe(0);
    expect(state.activeClipId).toBe("c2");
  });

  it("INCREMENT_EXPORTS increments count", () => {
    const state = reducer(initialState, { type: "INCREMENT_EXPORTS" });
    expect(state.exportsUsed).toBe(1);
  });

  it("SET_AI_MUSIC_ENABLED resets state when toggling off", () => {
    let state = reducer(initialState, { type: "SET_AI_MUSIC_RESULT", status: "completed", audioUrl: "url" });
    state = reducer(state, { type: "SET_AI_MUSIC_ENABLED", enabled: false });
    expect(state.aiMusicEnabled).toBe(false);
    expect(state.aiMusicStatus).toBe("idle");
    expect(state.aiMusicUrl).toBeNull();
  });

  it("RESET preserves isProUser and exportsUsed", () => {
    let state: AppState = { ...initialState, isProUser: true, exportsUsed: 3, step: "export" as const };
    state = reducer(state, { type: "RESET" });
    expect(state.step).toBe("upload");
    expect(state.isProUser).toBe(true);
    expect(state.exportsUsed).toBe(3);
  });

  it("SET_THEME changes detected theme", () => {
    const state = reducer(initialState, { type: "SET_THEME", theme: "sports" });
    expect(state.detectedTheme).toBe("sports");
  });

  it("SET_CREATIVE_DIRECTION sets direction", () => {
    const state = reducer(initialState, { type: "SET_CREATIVE_DIRECTION", direction: "moody" });
    expect(state.creativeDirection).toBe("moody");
  });
});

describe("canExportFree", () => {
  it("returns true when exports < limit", () => {
    expect(canExportFree({ ...initialState, exportsUsed: 0 })).toBe(true);
  });

  it("returns false when exports >= limit", () => {
    expect(canExportFree({ ...initialState, exportsUsed: 5 })).toBe(false);
  });
});

describe("getMediaFile", () => {
  it("finds file by ID", () => {
    const file = makeMediaFile({ id: "find-me" });
    const state = { ...initialState, mediaFiles: [file] };
    expect(getMediaFile(state, "find-me")).toBeDefined();
  });

  it("returns undefined for missing ID", () => {
    expect(getMediaFile(initialState, "nope")).toBeUndefined();
  });
});

