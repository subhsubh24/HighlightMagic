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

  it("SET_VALIDATION_STATUS updates validation status", () => {
    let state = reducer(initialState, { type: "SET_VALIDATION_STATUS", status: "validating" });
    expect(state.validationStatus).toBe("validating");
    state = reducer(state, { type: "SET_VALIDATION_STATUS", status: "fixing" });
    expect(state.validationStatus).toBe("fixing");
    state = reducer(state, { type: "SET_VALIDATION_STATUS", status: "passed" });
    expect(state.validationStatus).toBe("passed");
  });

  it("SET_REGENERATE_FEEDBACK resets validation status and pipeline state", () => {
    let state: AppState = {
      ...initialState,
      validationStatus: "passed",
      sfxStatus: "completed",
      voiceoverStatus: "completed",
      aiMusicStatus: "completed",
      aiMusicUrl: "some-url",
    };
    state = reducer(state, { type: "SET_REGENERATE_FEEDBACK", feedback: "make it more energetic" });
    expect(state.regenerateFeedback).toBe("make it more energetic");
    expect(state.validationStatus).toBe("idle");
    expect(state.sfxStatus).toBe("idle");
    expect(state.voiceoverStatus).toBe("idle");
    expect(state.aiMusicStatus).toBe("idle");
    expect(state.aiMusicUrl).toBeNull();
    expect(state.introCard).toBeNull();
    expect(state.outroCard).toBeNull();
  });

  it("SET_REGENERATE_FEEDBACK with null does not reset pipeline state", () => {
    let state: AppState = {
      ...initialState,
      validationStatus: "passed",
      sfxStatus: "completed",
    };
    state = reducer(state, { type: "SET_REGENERATE_FEEDBACK", feedback: null });
    expect(state.regenerateFeedback).toBeNull();
    expect(state.validationStatus).toBe("passed");
    expect(state.sfxStatus).toBe("completed");
  });

  it("SET_VIDEO adds the video to mediaFiles once (deduped by url)", () => {
    const file = new File([], "v.mp4");
    let state = reducer(initialState, { type: "SET_VIDEO", file, url: "blob:v", duration: 12 });
    expect(state.videoUrl).toBe("blob:v");
    expect(state.mediaFiles).toHaveLength(1);
    // Dispatching the same url again must not duplicate the media entry
    state = reducer(state, { type: "SET_VIDEO", file, url: "blob:v", duration: 12 });
    expect(state.mediaFiles).toHaveLength(1);
  });

  it("ADD_MEDIA derives the legacy video from the first video", () => {
    const photo = makeMediaFile({ id: "p1", type: "photo", url: "blob:p" });
    const video = makeMediaFile({ id: "v1", type: "video", url: "blob:v", duration: 20 });
    const state = reducer(initialState, { type: "ADD_MEDIA", files: [photo, video] });
    expect(state.videoUrl).toBe("blob:v");
    expect(state.videoDuration).toBe(20);
  });

  it("ADD_MEDIA falls back to a completed animated photo when no video exists", () => {
    const photo = makeMediaFile({
      id: "p1",
      type: "photo",
      url: "blob:p",
      animationStatus: "completed",
      animatedVideoUrl: "blob:anim",
      duration: 8,
    });
    const state = reducer(initialState, { type: "ADD_MEDIA", files: [photo] });
    expect(state.videoUrl).toBe("blob:anim");
    expect(state.videoDuration).toBe(8);
  });

  it("REMOVE_MEDIA clears photo-animation flags when no photos remain", () => {
    const photo = makeMediaFile({ id: "p1", type: "photo" });
    let state = reducer(initialState, { type: "ADD_MEDIA", files: [photo] });
    state = reducer(state, { type: "SET_ANIMATE_PHOTOS_ENABLED", enabled: true });
    expect(state.animatePhotosEnabled).toBe(true);
    state = reducer(state, { type: "REMOVE_MEDIA", fileId: "p1" });
    expect(state.mediaFiles).toHaveLength(0);
    expect(state.animatePhotosEnabled).toBe(false);
    expect(state.aiDecideAnimations).toBe(false);
  });

  it("REORDER_MEDIA moves an item and ignores out-of-bounds indices", () => {
    const a = makeMediaFile({ id: "a", url: "blob:a" });
    const b = makeMediaFile({ id: "b", url: "blob:b" });
    let state = reducer(initialState, { type: "ADD_MEDIA", files: [a, b] });
    state = reducer(state, { type: "REORDER_MEDIA", fromIndex: 0, toIndex: 1 });
    expect(state.mediaFiles.map((f) => f.id)).toEqual(["b", "a"]);
    // Out-of-bounds is a no-op (same reference back)
    const before = state;
    const after = reducer(state, { type: "REORDER_MEDIA", fromIndex: 5, toIndex: 0 });
    expect(after).toBe(before);
  });

  it("CLEAR_MEDIA empties media and resets legacy + animation flags", () => {
    const photo = makeMediaFile({ id: "p1", type: "photo" });
    let state = reducer(initialState, { type: "ADD_MEDIA", files: [photo] });
    state = reducer(state, { type: "SET_ANIMATE_PHOTOS_ENABLED", enabled: true });
    state = reducer(state, { type: "CLEAR_MEDIA" });
    expect(state.mediaFiles).toHaveLength(0);
    expect(state.videoUrl).toBeNull();
    expect(state.videoDuration).toBe(0);
    expect(state.animatePhotosEnabled).toBe(false);
  });

  it("SET_ACTIVE_CLIP sets the active clip id", () => {
    const clips = [{ id: "c1", order: 0 }, { id: "c2", order: 1 }] as AppState["clips"];
    let state = reducer(initialState, { type: "SET_CLIPS", clips });
    state = reducer(state, { type: "SET_ACTIVE_CLIP", clipId: "c2" });
    expect(state.activeClipId).toBe("c2");
  });

  it("SET_CLIPS preserves the active clip id when it still exists", () => {
    const clips = [{ id: "c1", order: 0 }, { id: "c2", order: 1 }] as AppState["clips"];
    let state = reducer(initialState, { type: "SET_CLIPS", clips });
    state = reducer(state, { type: "SET_ACTIVE_CLIP", clipId: "c2" });
    state = reducer(state, { type: "SET_CLIPS", clips });
    expect(state.activeClipId).toBe("c2");
  });

  it("UPDATE_CLIP merges partial updates into the matching clip only", () => {
    const clips = [{ id: "c1", order: 0, trimStart: 0 }, { id: "c2", order: 1, trimStart: 0 }] as AppState["clips"];
    let state = reducer(initialState, { type: "SET_CLIPS", clips });
    state = reducer(state, { type: "UPDATE_CLIP", clipId: "c2", updates: { trimStart: 3 } as AppState["clips"][number] });
    expect(state.clips.find((c) => c.id === "c1")!.trimStart).toBe(0);
    expect(state.clips.find((c) => c.id === "c2")!.trimStart).toBe(3);
  });

  it("REORDER_CLIPS reorders by visual order and reindexes", () => {
    const clips = [{ id: "c1", order: 0 }, { id: "c2", order: 1 }, { id: "c3", order: 2 }] as AppState["clips"];
    let state = reducer(initialState, { type: "SET_CLIPS", clips });
    state = reducer(state, { type: "REORDER_CLIPS", fromIndex: 2, toIndex: 0 });
    expect(state.clips.map((c) => c.id)).toEqual(["c3", "c1", "c2"]);
    expect(state.clips.map((c) => c.order)).toEqual([0, 1, 2]);
    // Out-of-bounds is a no-op
    const before = state;
    expect(reducer(state, { type: "REORDER_CLIPS", fromIndex: 9, toIndex: 0 })).toBe(before);
  });

  it("SET_VIRAL_OPTIONS merges partial options", () => {
    const state = reducer(initialState, { type: "SET_VIRAL_OPTIONS", options: { seamlessLoop: true } });
    expect(state.viralOptions.seamlessLoop).toBe(true);
    expect(state.viralOptions.beatSync).toBe(initialState.viralOptions.beatSync);
  });

  it("SET_ANIMATION_RESULT stores the animated url and derives legacy video from it", () => {
    const photo = makeMediaFile({ id: "p1", type: "photo", url: "blob:p", duration: 6 });
    let state = reducer(initialState, { type: "ADD_MEDIA", files: [photo] });
    state = reducer(state, {
      type: "SET_ANIMATION_RESULT",
      fileId: "p1",
      animatedVideoUrl: "blob:anim",
      animationStatus: "completed",
    });
    expect(state.mediaFiles[0].animatedVideoUrl).toBe("blob:anim");
    expect(state.videoUrl).toBe("blob:anim");
  });

  it("SET_ANIMATE_PHOTOS_ENABLED toggles every photo's animatePhoto flag", () => {
    const p1 = makeMediaFile({ id: "p1", type: "photo", url: "blob:p1" });
    const p2 = makeMediaFile({ id: "p2", type: "photo", url: "blob:p2" });
    let state = reducer(initialState, { type: "ADD_MEDIA", files: [p1, p2] });
    state = reducer(state, { type: "SET_ANIMATE_PHOTOS_ENABLED", enabled: true });
    expect(state.mediaFiles.every((f) => f.animatePhoto)).toBe(true);
    state = reducer(state, { type: "SET_ANIMATE_PHOTOS_ENABLED", enabled: false });
    expect(state.mediaFiles.some((f) => f.animatePhoto)).toBe(false);
    expect(state.aiDecideAnimations).toBe(false);
  });

  it("SET_AI_DECIDE_ANIMATIONS enables global animation and clears per-photo flags", () => {
    const photo = makeMediaFile({ id: "p1", type: "photo", url: "blob:p", animatePhoto: true });
    let state = reducer(initialState, { type: "ADD_MEDIA", files: [photo] });
    state = reducer(state, { type: "SET_AI_DECIDE_ANIMATIONS", enabled: true });
    expect(state.aiDecideAnimations).toBe(true);
    expect(state.animatePhotosEnabled).toBe(true);
    expect(state.mediaFiles[0].animatePhoto).toBe(false);
  });

  it("TOGGLE_PHOTO_ANIMATE derives animatePhotosEnabled from any animated photo", () => {
    const photo = makeMediaFile({ id: "p1", type: "photo", url: "blob:p", animatePhoto: false });
    let state = reducer(initialState, { type: "ADD_MEDIA", files: [photo] });
    state = reducer(state, { type: "TOGGLE_PHOTO_ANIMATE", fileId: "p1" });
    expect(state.mediaFiles[0].animatePhoto).toBe(true);
    expect(state.animatePhotosEnabled).toBe(true);
    state = reducer(state, { type: "TOGGLE_PHOTO_ANIMATE", fileId: "p1" });
    expect(state.animatePhotosEnabled).toBe(false);
  });

  it("SET_SFX_ENABLED clears sfx state when toggled off", () => {
    let state = reducer(initialState, { type: "SET_SFX_TRACKS", tracks: [{ clipIndex: 0 }] as AppState["sfxTracks"] });
    state = reducer(state, { type: "SET_SFX_STATUS", status: "completed" });
    state = reducer(state, { type: "SET_SFX_ENABLED", enabled: false });
    expect(state.sfxTracks).toHaveLength(0);
    expect(state.sfxStatus).toBe("idle");
  });

  it("SET_INTRO_OUTRO_ENABLED clears cards when toggled off", () => {
    let state = reducer(initialState, { type: "SET_INTRO_CARD", card: { text: "hi" } as AppState["introCard"] });
    state = reducer(state, { type: "SET_INTRO_OUTRO_ENABLED", enabled: false });
    expect(state.introCard).toBeNull();
    expect(state.outroCard).toBeNull();
  });

  it("SET_AI_MUSIC_RESULT nulls the url on failure but keeps it on success", () => {
    let state = reducer(initialState, { type: "SET_AI_MUSIC_RESULT", status: "completed", audioUrl: "blob:m" });
    expect(state.aiMusicUrl).toBe("blob:m");
    state = reducer(state, { type: "SET_AI_MUSIC_RESULT", status: "failed" });
    expect(state.aiMusicUrl).toBeNull();
  });

  it("UPDATE_SFX_TRACK updates only the matching clip index", () => {
    let state = reducer(initialState, {
      type: "SET_SFX_TRACKS",
      tracks: [{ clipIndex: 0 }, { clipIndex: 1 }] as AppState["sfxTracks"],
    });
    state = reducer(state, { type: "UPDATE_SFX_TRACK", clipIndex: 1, audioUrl: "blob:sfx", status: "completed" });
    expect(state.sfxTracks[0].audioUrl).toBeUndefined();
    expect(state.sfxTracks[1].audioUrl).toBe("blob:sfx");
    expect(state.sfxTracks[1].status).toBe("completed");
  });

  it("UPDATE_VOICEOVER_SEGMENT updates only the matching clip index", () => {
    let state = reducer(initialState, {
      type: "SET_VOICEOVER_SEGMENTS",
      segments: [{ clipIndex: 0 }, { clipIndex: 1 }] as AppState["voiceoverSegments"],
    });
    state = reducer(state, { type: "UPDATE_VOICEOVER_SEGMENT", clipIndex: 0, audioUrl: "blob:vo", duration: 4, status: "completed" });
    expect(state.voiceoverSegments[0].audioUrl).toBe("blob:vo");
    expect(state.voiceoverSegments[0].duration).toBe(4);
    expect(state.voiceoverSegments[1].audioUrl).toBeUndefined();
  });

  it("SET_CLONED_VOICE stores the voice id and status together", () => {
    const state = reducer(initialState, { type: "SET_CLONED_VOICE", voiceId: "vid-1", status: "completed" });
    expect(state.clonedVoiceId).toBe("vid-1");
    expect(state.voiceCloneStatus).toBe("completed");
  });

  it("SET_INSTRUMENTAL_MUSIC stores url and stem-separation status together", () => {
    const state = reducer(initialState, { type: "SET_INSTRUMENTAL_MUSIC", url: "blob:inst", status: "completed" });
    expect(state.instrumentalMusicUrl).toBe("blob:inst");
    expect(state.stemSeparationStatus).toBe("completed");
  });

  it("SET_STYLE_TRANSFER_PROMPT defaults strength to null when omitted", () => {
    const state = reducer(initialState, { type: "SET_STYLE_TRANSFER_PROMPT", prompt: "vhs" });
    expect(state.styleTransferPrompt).toBe("vhs");
    expect(state.styleTransferStrength).toBeNull();
  });

  it("unknown action returns the same state reference", () => {
    const state = reducer(initialState, { type: "__UNKNOWN__" } as unknown as Parameters<typeof reducer>[1]);
    expect(state).toBe(initialState);
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

