"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowLeft, Download, Share2, RotateCcw, Crown, Film, Repeat, Music } from "lucide-react";
import { useApp, canExportFree, getMediaFile } from "@/lib/store";
import { VIDEO_FILTERS } from "@/lib/filters";
import {
  WATERMARK_TEXT,
  FREE_EXPORT_LIMIT,
  IOS_APP_STORE_URL,
  EXPORT_BITRATE,
} from "@/lib/constants";
import { getEditingStyle } from "@/lib/editing-styles";
import {
  getClipAlpha,
  getTransitionTransform,
  drawTransitionOverlay,
  getClipEntryScale,
  type TransitionType,
} from "@/lib/transitions";
import { buildBeatGrid, getBeatIntensity, validateTimeline, type BeatGrid } from "@/lib/beat-sync";
import { getSpeedAtPosition, getSpeedFromKeyframes, getEffectiveDuration } from "@/lib/velocity";
import { getKineticTransform, drawKineticCaption, type CustomCaptionParams } from "@/lib/kinetic-text";
import { createAudioPipeline, type AudioPipeline, type ScheduledAudioLayer } from "@/lib/audio-mux";
import { haptic } from "@/lib/utils";
import Confetti from "@/components/Confetti";
import type { EditedClip, EditingTheme, CaptionStyle, ViralExportOptions, AppState } from "@/lib/types";
import { EXPORT_WIDTH, EXPORT_HEIGHT, EXPORT_FRAME_RATE } from "@/lib/constants";

const DEBUG = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEBUG === "1";
function debugLog(...args: unknown[]) { if (DEBUG) console.log(...args); }

type ExportPhase = "preview" | "rendering" | "done" | "limit-hit" | "error";
type ThumbnailPhase = "idle" | "generating" | "done" | "failed";

/**
 * Attempt server-side FFmpeg rendering (Arch #1).
 * Returns a Blob on success, or null if server rendering is unavailable.
 */
/** Cache the 501 result so we only probe once per page load. */
let serverRenderAvailable: boolean | null = null;

async function tryServerRender(
  clips: EditedClip[],
  state: AppState,
  isFree: boolean
): Promise<Blob | null> {
  // Skip entirely if we already know server rendering is unavailable
  if (serverRenderAvailable === false) return null;
  try {
    const renderClips: Array<{
      sourceUrl: string; startTime: number; endTime: number;
      filter?: string; transitionType?: string; transitionDuration?: number;
      captionText?: string; captionStyle?: string;
    }> = [];

    // Use AI-driven durations and volumes from production plan
    const plan = state.aiProductionPlan;
    const hasIntro = state.introCard?.status === "completed" && state.introCard.videoUrl;
    const hasOutro = state.outroCard?.status === "completed" && state.outroCard.videoUrl;
    const introDur = state.introCard?.duration ?? 4;
    const outroDur = state.outroCard?.duration ?? 4;
    const introOffset = hasIntro ? introDur : 0;
    const defaultTransDur = plan?.defaultTransitionDuration ?? 0.3;
    const voDelay = plan?.voiceover?.delaySec ?? 0.3;
    const musicVol = plan?.musicVolume ?? 0.5;
    const sfxVol = plan?.sfxVolume ?? 0.8;
    const voVol = plan?.voiceoverVolume ?? 1.0;

    if (hasIntro) {
      renderClips.push({
        sourceUrl: state.introCard!.videoUrl!,
        startTime: 0,
        endTime: introDur,
      });
    }

    for (const clip of clips) {
      const media = state.mediaFiles.find((m) => m.id === clip.sourceFileId);
      const hasAnimatedVideo = media?.type === "photo" &&
        media.animationStatus === "completed" &&
        media.animatedVideoUrl;
      renderClips.push({
        sourceUrl: hasAnimatedVideo ? media.animatedVideoUrl! : (media?.url ?? ""),
        startTime: clip.trimStart,
        endTime: clip.trimEnd,
        filter: clip.customFilterCSS || undefined,
        transitionType: clip.transitionType,
        transitionDuration: clip.transitionDuration,
        captionText: clip.captionText || undefined,
        captionStyle: clip.captionStyle || undefined,
      });
    }

    if (hasOutro) {
      renderClips.push({
        sourceUrl: state.outroCard!.videoUrl!,
        startTime: 0,
        endTime: outroDur,
      });
    }

    const audioLayers: Array<{ url: string; startTime: number; volume: number }> = [];
    if (state.aiMusicUrl) {
      audioLayers.push({ url: state.aiMusicUrl, startTime: 0, volume: musicVol });
    }

    // Compute per-clip timeline offsets for voiceover / SFX placement
    // Offset by intro card duration since clipIndex refers to user clips only
    const clipStarts: number[] = [];
    const clipEnds: number[] = [];
    let t = introOffset;
    for (let i = 0; i < clips.length; i++) {
      const dur = clips[i].trimEnd - clips[i].trimStart;
      clipStarts.push(t);
      clipEnds.push(t + dur);
      t += dur - (clips[i + 1]?.transitionDuration ?? defaultTransDur);
    }

    // Voiceover segments
    for (const vo of state.voiceoverSegments ?? []) {
      if (!vo.audioUrl || vo.status !== "completed") continue;
      const start = clipStarts[vo.clipIndex];
      if (start == null) continue;
      audioLayers.push({ url: vo.audioUrl, startTime: start + voDelay, volume: voVol });
    }

    // SFX tracks
    for (const sfx of state.sfxTracks ?? []) {
      if (!sfx.audioUrl || sfx.status !== "completed") continue;
      const clipStart = clipStarts[sfx.clipIndex];
      const clipEnd = clipEnds[sfx.clipIndex];
      if (clipStart == null) continue;
      let sfxStart = clipStart;
      if (sfx.timing === "before") sfxStart = Math.max(0, clipStart - 0.5);
      else if (sfx.timing === "after") sfxStart = (clipEnd ?? clipStart) - defaultTransDur;
      audioLayers.push({ url: sfx.audioUrl, startTime: sfxStart, volume: sfxVol });
    }

    const res = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clips: renderClips,
        audioLayers,
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        fps: EXPORT_FRAME_RATE,
        bitrate: plan?.exportBitrate ?? EXPORT_BITRATE,
        seamlessLoop: state.viralOptions.seamlessLoop,
        watermark: isFree ? WATERMARK_TEXT : undefined,
      }),
    });

    if (res.status === 501) {
      // Server rendering not enabled — cache this and never probe again
      serverRenderAvailable = false;
      return null;
    }
    serverRenderAvailable = true;

    if (!res.ok) {
      console.warn("[render] Server render failed, falling back to client-side");
      return null;
    }

    const data = await res.json();
    if (data.jobId) {
      debugLog(`[render] Server render job queued: ${data.jobId}`);
      // Poll for server-side render completion using the shared poll endpoint
      const POLL_INTERVAL = 5_000;
      const MAX_POLLS = 60; // 5 min max
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const check = await fetch("/api/animate/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ predictionId: data.jobId }),
        });
        if (!check.ok) continue;
        const status = await check.json();
        if (status.status === "completed" && status.videoUrl) {
          // Download rendered video as Blob
          const videoRes = await fetch(status.videoUrl);
          if (videoRes.ok) return await videoRes.blob();
        }
        if (status.status === "failed") break;
      }
      // Timed out or failed — fall back to client-side rendering
      return null;
    }

    return null;
  } catch (e) {
    console.error("[Export] Server rendering failed, falling back to client-side:", e);
    return null;
  }
}

/** Try codecs in preference order. */
function pickMimeType(): { mimeType: string; ext: string } {
  const candidates = [
    // Chrome 131+ uses avc1 naming for H.264 in MP4
    { mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', ext: "mp4" },
    { mimeType: "video/mp4;codecs=avc1", ext: "mp4" },
    // Safari uses h264 naming
    { mimeType: "video/mp4;codecs=h264", ext: "mp4" },
    { mimeType: "video/mp4", ext: "mp4" },
    // WebM fallback
    { mimeType: "video/webm;codecs=h264", ext: "webm" },
    { mimeType: "video/webm;codecs=vp9", ext: "webm" },
    { mimeType: "video/webm;codecs=vp8", ext: "webm" },
    { mimeType: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: "video/webm", ext: "webm" };
}

export default function ExportStep() {
  const { state, dispatch } = useApp();
  const [phase, setPhase] = useState<ExportPhase>("preview");
  const [progress, setProgress] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [exportExt, setExportExt] = useState("webm");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailPhase, setThumbnailPhase] = useState<ThumbnailPhase>("idle");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbnailAbortRef = useRef<AbortController | null>(null);

  // Cleanup blob URL and abort thumbnail polling on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      thumbnailAbortRef.current?.abort();
    };
  }, [blobUrl]);

  const sortedClips = [...state.clips].sort((a, b) => a.order - b.order);
  const defaultTransDurPreview = state.aiProductionPlan?.defaultTransitionDuration ?? 0.3;
  const totalDuration = sortedClips.reduce((sum, c, i) => {
    let dur = sum + (c.trimEnd - c.trimStart);
    if (i < sortedClips.length - 1) {
      dur -= sortedClips[i + 1]?.transitionDuration ?? defaultTransDurPreview;
    }
    return dur;
  }, 0)
    + (state.introCard?.status === "completed" && state.introCard.videoUrl ? (state.introCard.duration ?? 4) : 0)
    + (state.outroCard?.status === "completed" && state.outroCard.videoUrl ? (state.outroCard.duration ?? 4) : 0);
  const style = getEditingStyle(state.detectedTheme);
  const hasMusic = sortedClips.some((c) => c.selectedMusicTrack);

  const isFree = !state.isProUser;
  const canExport = state.isProUser || canExportFree(state);



  const generateThumbnail = useCallback(async () => {
    const plan = state.aiProductionPlan;
    if (!plan?.thumbnail) return;

    // Abort any previous thumbnail generation
    thumbnailAbortRef.current?.abort();
    const abort = new AbortController();
    thumbnailAbortRef.current = abort;

    setThumbnailPhase("generating");
    try {
      // Find the source clip for the thumbnail
      const clip = sortedClips[plan.thumbnail.sourceClipIndex];
      if (!clip) { setThumbnailPhase("failed"); return; }

      const media = getMediaFile(state, clip.sourceFileId);
      if (!media) { setThumbnailPhase("failed"); return; }

      // Extract frame at the specified time using canvas
      if (media.type === "video") {
        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.preload = "auto";
        video.src = media.url;
        // Correct lifecycle: load → wait for loadeddata → seek → wait for seeked
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => {
            video.currentTime = plan.thumbnail!.frameTime;
            video.onseeked = () => resolve();
          };
          video.onerror = () => reject(new Error("Failed to load video for thumbnail"));
          video.load();
        });
        if (abort.signal.aborted) {
          video.src = "";
          video.removeAttribute("src");
          return;
        }
        const c = document.createElement("canvas");
        c.width = 1080; c.height = 1920;
        const ctx = c.getContext("2d");
        if (!ctx) { console.error("[Thumbnail] Failed to create canvas context"); setThumbnailPhase("failed"); return; }
        ctx.drawImage(video, 0, 0, c.width, c.height);
        // Clean up the video element to release memory
        video.src = "";
        video.removeAttribute("src");
        video.load();
        const frameDataUri = c.toDataURL("image/jpeg", 0.9);

        // Submit to BG removal
        const res = await fetch("/api/thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageData: frameDataUri }),
          signal: abort.signal,
        });
        const data = await res.json();
        if (res.ok && data.predictionId) {
          // Poll for result
          const deadline = Date.now() + 120_000;
          while (Date.now() < deadline) {
            if (abort.signal.aborted) return;
            await new Promise((r) => setTimeout(r, 5000));
            if (abort.signal.aborted) return;
            const checkRes = await fetch("/api/animate/check", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ predictionId: data.predictionId }),
              signal: abort.signal,
            });
            const checkData = await checkRes.json();
            if (checkData.status === "completed" && checkData.videoUrl) {
              setThumbnailUrl(checkData.videoUrl);
              setThumbnailPhase("done");
              return;
            }
            if (checkData.status === "failed") break;
          }
        }
      }
      if (!abort.signal.aborted) setThumbnailPhase("failed");
    } catch (e) {
      console.error("[Export] Thumbnail generation failed:", e);
      if (!abort.signal.aborted) setThumbnailPhase("failed");
    }
  }, [state, sortedClips]);

  const handleExport = useCallback(async () => {
    if (!canExport) {
      setPhase("limit-hit");
      return;
    }

    setPhase("rendering");
    setProgress(0);
    haptic();

    const blobUrlsToRevoke: string[] = [];
    try {
      // Attempt server-side FFmpeg rendering first (Arch #1)
      // Falls back to client-side Canvas+MediaRecorder if server rendering is unavailable
      const serverResult = await tryServerRender(sortedClips, state, isFree);
      if (serverResult) {
        const url = URL.createObjectURL(serverResult);
        setBlobUrl(url);
        setExportExt("mp4");
        dispatch({ type: "INCREMENT_EXPORTS" });
        setPhase("done");
        haptic([10, 50, 10]);
        if (state.thumbnail && state.thumbnail.status !== "completed") {
          generateThumbnail();
        }
        return;
      }
      // Server rendering not available — fall back to client-side
      const renderClips: RenderClipInstruction[] = [];

      // AI-driven durations and volumes from production plan
      const cPlan = state.aiProductionPlan;
      const hasIntroC = state.introCard?.status === "completed" && state.introCard.videoUrl;
      const hasOutroC = state.outroCard?.status === "completed" && state.outroCard.videoUrl;
      const introDurC = state.introCard?.duration ?? 4;
      const outroDurC = state.outroCard?.duration ?? 4;
      const introOffsetC = hasIntroC ? introDurC : 0;
      const defaultTransDurC = cPlan?.defaultTransitionDuration ?? 0.3;
      const voDelayC = cPlan?.voiceover?.delaySec ?? 0.3;
      const sfxVolC = cPlan?.sfxVolume ?? 0.8;
      const voVolC = cPlan?.voiceoverVolume ?? 1.0;

      if (hasIntroC) {
        const introClip: EditedClip = {
          id: "__intro__",
          sourceFileId: "__intro__",
          segment: { id: "__intro__", sourceFileId: "__intro__", startTime: 0, endTime: introDurC, confidenceScore: 1, label: "Intro", detectionSources: [] },
          trimStart: 0,
          trimEnd: introDurC,
          order: -1,
          selectedMusicTrack: null,
          captionText: "",
          captionStyle: "Bold",
          selectedFilter: "None",
          velocityPreset: "normal",
        };
        renderClips.push({
          clip: introClip,
          mediaUrl: state.introCard!.videoUrl!,
          mediaType: "video",
          filterCSS: "",
          captionText: "",
          captionStyle: "Bold",
        });
      }

      for (const clip of sortedClips) {
        const media = getMediaFile(state, clip.sourceFileId);
        // Use animated video if available (photo → video via Kling 3.0)
        const hasAnimatedVideo = media?.type === "photo" &&
          media.animationStatus === "completed" &&
          media.animatedVideoUrl;
        renderClips.push({
          clip,
          mediaUrl: hasAnimatedVideo ? media.animatedVideoUrl! : (media?.url ?? ""),
          mediaType: hasAnimatedVideo ? "video" as const : (media?.type ?? "video"),
          filterCSS: clip.customFilterCSS ?? VIDEO_FILTERS[clip.selectedFilter],
          captionText: clip.captionText,
          captionStyle: clip.captionStyle,
        });
      }

      // Append outro card if available
      if (hasOutroC) {
        const outroClip: EditedClip = {
          id: "__outro__",
          sourceFileId: "__outro__",
          segment: { id: "__outro__", sourceFileId: "__outro__", startTime: 0, endTime: outroDurC, confidenceScore: 1, label: "Outro", detectionSources: [] },
          trimStart: 0,
          trimEnd: outroDurC,
          order: 9999,
          selectedMusicTrack: null,
          captionText: "",
          captionStyle: "Bold",
          selectedFilter: "None",
          velocityPreset: "normal",
        };
        renderClips.push({
          clip: outroClip,
          mediaUrl: state.outroCard!.videoUrl!,
          mediaType: "video",
          filterCSS: "",
          captionText: "",
          captionStyle: "Bold",
        });
      }

      // Pre-validate: remove clips with missing media URLs (expired blobs, missing sources)
      const validRenderClips = renderClips.filter((rc) => {
        if (!rc.mediaUrl) {
          console.warn(`Export: dropping clip "${rc.clip.id}" — empty media URL (source may have been removed)`);
          return false;
        }
        return true;
      });
      if (validRenderClips.length === 0) {
        throw new Error("No valid clips to render — all media URLs are missing. Try re-uploading your files.");
      }

      // Pre-fetch remote URLs as local blobs to avoid CORS issues with canvas rendering.
      // Blob URLs (from user uploads) are fine as-is, but external URLs (intro/outro cards
      // from Atlas Cloud / DashScope) need to be fetched and converted to blob URLs so the
      // video element with crossOrigin="anonymous" can load them without CORS errors.
      for (const rc of validRenderClips) {
        if (rc.mediaUrl && !rc.mediaUrl.startsWith("blob:")) {
          try {
            const resp = await fetch(rc.mediaUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const localUrl = URL.createObjectURL(blob);
            blobUrlsToRevoke.push(localUrl);
            rc.mediaUrl = localUrl;
          } catch (err) {
            console.warn(`Export: failed to pre-fetch media for clip "${rc.clip.id}", will try direct load`, err);
          }
        }
      }

      const { mimeType, ext } = pickMimeType();
      setExportExt(ext);

      // Build scheduled audio layers for voiceover + SFX
      // Audio timing must match the actual rendered durations (beat-snapped if beat-sync is active)
      const scheduled: ScheduledAudioLayer[] = [];
      {
        // Build beat grid for audio scheduling — must match renderHighlightTape logic
        let audioBeatGrid: ReturnType<typeof buildBeatGrid> | null = null;
        if (state.viralOptions.beatSync) {
          const track = sortedClips.find((c) => c.selectedMusicTrack)?.selectedMusicTrack;
          if (track) audioBeatGrid = buildBeatGrid(track.bpm, 300);
        }
        const cStarts: number[] = [];
        const cEnds: number[] = [];
        let st = introOffsetC; // Start after intro card duration
        for (let i = 0; i < sortedClips.length; i++) {
          let dur = sortedClips[i].trimEnd - sortedClips[i].trimStart;
          // Apply beat-sync snapping to match actual render durations
          if (audioBeatGrid && audioBeatGrid.beatInterval > 0) {
            const beats = Math.max(2, Math.round(dur / audioBeatGrid.beatInterval));
            dur = beats * audioBeatGrid.beatInterval;
          }
          cStarts.push(st);
          cEnds.push(st + dur);
          st += dur - (sortedClips[i + 1]?.transitionDuration ?? defaultTransDurC);
        }
        for (const vo of state.voiceoverSegments ?? []) {
          if (!vo.audioUrl || vo.status !== "completed") continue;
          const s = cStarts[vo.clipIndex];
          if (s == null) continue;
          scheduled.push({ url: vo.audioUrl, startTime: s + voDelayC, volume: voVolC, layerType: "voiceover" });
        }
        for (const sfx of state.sfxTracks ?? []) {
          if (!sfx.audioUrl || sfx.status !== "completed") continue;
          const cs = cStarts[sfx.clipIndex];
          const ce = cEnds[sfx.clipIndex];
          if (cs == null) continue;
          let sfxS = cs;
          if (sfx.timing === "before") sfxS = Math.max(0, cs - 0.5);
          else if (sfx.timing === "after") sfxS = (ce ?? cs) - defaultTransDurC;
          scheduled.push({ url: sfx.audioUrl, startTime: sfxS, volume: sfxVolC, layerType: "sfx" });
        }
      }

      const blob = await renderHighlightTape(
        validRenderClips,
        isFree ? WATERMARK_TEXT : null,
        state.detectedTheme,
        state.viralOptions,
        mimeType,
        (pct) => setProgress(pct),
        state.aiMusicUrl,
        scheduled,
        defaultTransDurC,
        cPlan?.musicVolume ?? 0.5,
        cPlan?.musicDuckRatio ?? 0.3,
        cPlan?.loopCrossfadeDuration ?? 0.5,
        cPlan?.exportBitrate ?? 12_000_000,
        cPlan?.watermarkOpacity ?? 0.4,
        cPlan?.captionEntranceDuration ?? 0.5,
        cPlan?.captionExitDuration ?? 0.3,
        cPlan?.neonColors,
        cPlan?.photoDisplayDuration ?? 3,
        cPlan?.beatSyncToleranceMs ?? 50,
        cPlan ? {
          beatPulseIntensity: cPlan.beatPulseIntensity,
          beatFlashOpacity: cPlan.beatFlashOpacity,
          captionFontSize: cPlan.captionFontSize,
          captionVerticalPosition: cPlan.captionVerticalPosition,
          captionShadowColor: cPlan.captionShadowColor,
          captionShadowBlur: cPlan.captionShadowBlur,
          flashOverlayAlpha: cPlan.flashOverlayAlpha,
          zoomPunchFlashAlpha: cPlan.zoomPunchFlashAlpha,
          colorFlashAlpha: cPlan.colorFlashAlpha,
          strobeFlashCount: cPlan.strobeFlashCount,
          strobeFlashAlpha: cPlan.strobeFlashAlpha,
          lightLeakColor: cPlan.lightLeakColor,
          glitchColors: cPlan.glitchColors,
        } : undefined,
      );

      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      dispatch({ type: "INCREMENT_EXPORTS" });
      setPhase("done");
      haptic([10, 50, 10]);

      // Auto-generate thumbnail from AI's chosen frame (non-blocking)
      if (state.thumbnail && state.thumbnail.status !== "completed") {
        generateThumbnail();
      }
    } catch (err) {
      console.error("Export failed:", err);
      setPhase("error");
    } finally {
      // Clean up pre-fetched blob URLs
      blobUrlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
    }
  }, [canExport, sortedClips, state, isFree, dispatch]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `highlight-tape-${Date.now()}.${exportExt}`;
    a.click();
    haptic();
  };

  const handleShare = async () => {
    if (!blobUrl) return;
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const file = new File([blob], `highlight-tape.${exportExt}`, {
        type: exportExt === "mp4" ? "video/mp4" : "video/webm",
      });
      if (navigator.share) {
        await navigator.share({ files: [file], title: "Made with Highlight Magic" });
      } else {
        handleDownload();
      }
    } catch (e) {
      console.warn("[Export] Share failed, falling back to download:", e);
      handleDownload();
    }
  };

  const toggleViralOption = (key: keyof ViralExportOptions) => {
    dispatch({ type: "SET_VIRAL_OPTIONS", options: { [key]: !state.viralOptions[key] } });
  };

  return (
    <div className="flex flex-1 flex-col items-center gap-6 animate-fade-in">
      {phase === "done" && <Confetti />}

      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: "editor" })}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="font-semibold text-white">Export Highlight Tape</h2>
        <div className="w-9" />
      </div>

      {/* Preview phase */}
      {phase === "preview" && (
        <>
          <div className="glass-card w-full p-4">
            <div className="flex flex-col gap-2 text-sm">
              <Row label="Clips" value={`${sortedClips.length} clips combined`} />
              <Row label="Duration" value={`~${Math.round(totalDuration)}s`} />
              <Row label="Style" value={style.label} />
              {isFree && (
                <Row
                  label="Free exports left"
                  value={`${FREE_EXPORT_LIMIT - state.exportsUsed}/${FREE_EXPORT_LIMIT}`}
                />
              )}
            </div>
          </div>

          {/* Extra options */}
          <div className="glass-card w-full p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Extras
            </p>
            <div className="flex flex-col gap-2.5">
              <label className="flex cursor-pointer items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Music className="h-4 w-4 text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Beat Sync</p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      Cuts land on the beat of the music
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={state.viralOptions.beatSync}
                  onChange={() => toggleViralOption("beatSync")}
                  className="h-4 w-4 rounded accent-[var(--accent)]"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Repeat className="h-4 w-4 text-blue-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Loop</p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      Blends the end into the start for infinite replay
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={state.viralOptions.seamlessLoop}
                  onChange={() => toggleViralOption("seamlessLoop")}
                  className="h-4 w-4 rounded accent-[var(--accent)]"
                />
              </label>
            </div>
          </div>

          <button onClick={handleExport} className="btn-primary flex w-full items-center justify-center gap-2">
            <Download className="h-5 w-5" />
            Export Highlight Tape
          </button>
        </>
      )}

      {/* Rendering phase */}
      {phase === "rendering" && (() => {
        const rSize = 100;
        const rStroke = 5;
        const rRadius = (rSize - rStroke) / 2;
        const rCirc = 2 * Math.PI * rRadius;
        const rOffset = rCirc - (progress / 100) * rCirc;
        return (
          <div className="flex w-full flex-col items-center gap-5 py-12 animate-fade-in">
            {/* Circular progress */}
            <div className="relative">
              <svg width={rSize} height={rSize} className="rotate-[-90deg]">
                <circle cx={rSize / 2} cy={rSize / 2} r={rRadius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={rStroke} />
                <circle cx={rSize / 2} cy={rSize / 2} r={rRadius} fill="none" stroke="url(#export-gradient)" strokeWidth={rStroke} strokeLinecap="round" strokeDasharray={rCirc} strokeDashoffset={rOffset} className="transition-all duration-300" />
                <defs>
                  <linearGradient id="export-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="var(--accent)" />
                    <stop offset="100%" stopColor="var(--accent-pink)" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-white tabular-nums">{Math.round(progress)}%</span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-white">
                Rendering your highlight tape
              </p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                {style.label} style · {sortedClips.length} clips
              </p>
            </div>

            <div className="flex gap-2 text-[10px]">
              {state.viralOptions.beatSync && hasMusic && <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-400 font-medium">Beat Sync</span>}
              {state.viralOptions.seamlessLoop && <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-blue-400 font-medium">Loop</span>}
            </div>
          </div>
        );
      })()}

      {/* Done phase — video player */}
      {phase === "done" && (
        <div className="flex flex-col items-center gap-5 py-4 w-full">
          {blobUrl && (
            <div className="relative aspect-[9/16] w-full max-w-xs overflow-hidden rounded-2xl bg-black">
              <video
                src={blobUrl}
                className="h-full w-full object-contain"
                controls
                playsInline
                loop
              />
            </div>
          )}

          <div className="text-center">
            <h3 className="text-2xl font-bold text-white">Your tape is ready!</h3>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              {sortedClips.length} clips · {style.label} style
            </p>
          </div>

          <div className="flex w-full gap-3">
            <button onClick={handleDownload} className="btn-primary flex flex-1 items-center justify-center gap-2">
              <Download className="h-5 w-5" />
              Download
            </button>
            <button onClick={handleShare} className="btn-secondary flex flex-1 items-center justify-center gap-2">
              <Share2 className="h-5 w-5" />
              Share
            </button>
          </div>
          <button
            onClick={() => dispatch({ type: "RESET" })}
            className="flex items-center justify-center gap-2 py-2 text-sm text-[var(--text-tertiary)] hover:text-white transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Create another tape
          </button>

          {/* Auto-generated thumbnail */}
          {thumbnailPhase === "generating" && (
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-xs text-[var(--text-tertiary)]">
              <RotateCcw className="h-3.5 w-3.5 animate-spin" />
              Generating social thumbnail...
            </div>
          )}
          {thumbnailPhase === "done" && thumbnailUrl && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-[var(--text-tertiary)]">Social Thumbnail</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbnailUrl} alt="Generated thumbnail" className="w-32 rounded-lg border border-white/10" />
              <a href={thumbnailUrl} download="thumbnail.png" className="text-xs text-[var(--accent)] hover:underline">
                Download Thumbnail
              </a>
            </div>
          )}

          <p className="text-xs text-[var(--text-tertiary)]">Made with Highlight Magic</p>

          {isFree && (
            <a
              href={IOS_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card flex items-center gap-3 p-4 transition-all hover:border-yellow-500/50"
            >
              <Crown className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-sm font-semibold text-white">Go Pro on iOS</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Unlimited exports, no watermark, offline AI
                </p>
              </div>
            </a>
          )}
        </div>
      )}

      {/* Error phase */}
      {phase === "error" && (
        <div className="flex flex-col items-center gap-6 py-12">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-red-500/20">
            <Film className="h-9 w-9 text-red-400" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-white">Export Failed</h3>
            <p className="mt-1 max-w-sm text-[var(--text-secondary)]">
              Something went wrong while rendering your highlight tape. Please try again.
            </p>
          </div>
          <button
            onClick={() => setPhase("preview")}
            className="btn-primary flex items-center gap-2"
          >
            <RotateCcw className="h-5 w-5" />
            Try Again
          </button>
        </div>
      )}

      {/* Limit hit phase */}
      {phase === "limit-hit" && (
        <div className="flex flex-col items-center gap-6 py-12">
          <Crown className="h-16 w-16 text-yellow-500" />
          <div className="text-center">
            <h3 className="text-xl font-bold text-white">Free Exports Used Up</h3>
            <p className="mt-1 text-[var(--text-secondary)]">
              You&apos;ve used all {FREE_EXPORT_LIMIT} free exports this month
            </p>
          </div>
          <a
            href={IOS_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex items-center gap-2"
          >
            <Crown className="h-5 w-5" />
            Upgrade to Pro — $4.99/mo
          </a>
          <button
            onClick={() => dispatch({ type: "SET_STEP", step: "editor" })}
            className="text-sm text-[var(--text-tertiary)] hover:text-white"
          >
            Go Back
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-tertiary)]">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

// ── Theme-aware multi-clip rendering with viral features ──

interface RenderClipInstruction {
  clip: EditedClip;
  mediaUrl: string;
  mediaType: "video" | "photo";
  filterCSS: string;
  captionText: string;
  captionStyle: CaptionStyle;
}

async function renderHighlightTape(
  clips: RenderClipInstruction[],
  watermarkText: string | null,
  theme: EditingTheme,
  viralOptions: ViralExportOptions,
  mimeType: string,
  onProgress: (pct: number) => void,
  aiMusicUrl?: string | null,
  scheduledLayers?: ScheduledAudioLayer[],
  defaultTransitionDuration: number = 0.3,
  musicVolume: number = 0.5,
  musicDuckRatio: number = 0.3,
  loopCrossfadeDuration: number = 0.5,
  exportBitrate: number = 12_000_000,
  watermarkOpacity: number = 0.4,
  captionEntranceDuration: number = 0.5,
  captionExitDuration: number = 0.3,
  neonColors?: string[],
  photoDisplayDuration: number = 3,
  beatSyncToleranceMs: number = 50,
  aiRenderOpts?: ExportAiRenderOptions,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create canvas 2D context — browser may have exhausted GPU resources");

  const style = getEditingStyle(theme);
  const fallbackTransition: TransitionType = "hard_cut";

  // Beat grid for beat-sync
  let beatGrid: BeatGrid | null = null;
  if (viralOptions.beatSync) {
    const track = clips.find((c) => c.clip.selectedMusicTrack)?.clip.selectedMusicTrack;
    if (track) beatGrid = buildBeatGrid(track.bpm, 300);
  }

  // Pre-render validation: log beat-sync quality and timeline issues
  const renderValidation = validateTimeline(
    clips.map((c) => ({
      sourceFileId: c.clip.sourceFileId,
      trimStart: c.clip.trimStart,
      trimEnd: c.clip.trimEnd,
      transitionDuration: c.clip.transitionDuration,
    })),
    defaultTransitionDuration,
    beatGrid
  );
  if (renderValidation.issues.length > 0) {
    console.warn("Export validation issues:", renderValidation.issues);
  }
  if (renderValidation.beatSync) {
    const bs = renderValidation.beatSync;
    debugLog(`Export beat-sync: quality=${bs.quality.toFixed(2)} (${bs.label}), ${bs.tightCount}/${bs.totalTransitions} tight, avg=${bs.avgOffsetMs.toFixed(1)}ms, max=${bs.maxOffsetMs.toFixed(1)}ms`);
  }

  // Audio pipeline: captures original clip audio + optional background music
  const canvasStream = canvas.captureStream(EXPORT_FRAME_RATE);
  const musicTrack = clips.find((c) => c.clip.selectedMusicTrack)?.clip.selectedMusicTrack ?? null;
  const audioPipeline = await createAudioPipeline(canvasStream, musicTrack, aiMusicUrl, scheduledLayers, musicVolume, musicDuckRatio);
  // Calculate totalDuration accounting for beat-sync adjustments and per-clip transition overlaps
  let totalDuration = 0;
  for (let i = 0; i < clips.length; i++) {
    const sourceDur = clips[i].clip.trimEnd - clips[i].clip.trimStart;
    let clipDur = getEffectiveDuration(sourceDur, clips[i].clip.velocityPreset, clips[i].clip.customVelocityKeyframes);
    if (beatGrid && beatGrid.beatInterval > 0) {
      const beats = Math.max(2, Math.round(clipDur / beatGrid.beatInterval));
      clipDur = beats * beatGrid.beatInterval;
    }
    totalDuration += clipDur;
    if (i < clips.length - 1) {
      totalDuration -= clips[i + 1]?.clip.transitionDuration ?? defaultTransitionDuration;
    }
  }

  const recorder = new MediaRecorder(audioPipeline.stream, {
    mimeType,
    videoBitsPerSecond: exportBitrate,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let elapsedTotal = 0;
  let crossfadeCanvas: HTMLCanvasElement | null = null;

  // For seamless loop: save the first frame
  let firstFrameCanvas: HTMLCanvasElement | null = null;

  recorder.start();

  for (let i = 0; i < clips.length; i++) {
    const instruction = clips[i];
    let clipDuration = instruction.clip.trimEnd - instruction.clip.trimStart;

    // Beat-sync: snap clip duration to beat grid
    if (beatGrid && beatGrid.beatInterval > 0) {
      const beats = Math.max(2, Math.round(clipDuration / beatGrid.beatInterval));
      clipDuration = beats * beatGrid.beatInterval;
    }

    // Per-clip transition: AI-decided takes priority, then theme fallback
    const transType = i > 0
      ? ((instruction.clip.transitionType as TransitionType) ?? fallbackTransition)
      : null;
    const crossfadeFrom = i > 0 ? crossfadeCanvas : null;

    // Per-clip style values (AI-specified, neutral defaults as last resort)
    const clipStyle = {
      ...style,
      transitionDuration: instruction.clip.transitionDuration ?? defaultTransitionDuration,
      entryPunchScale: instruction.clip.entryPunchScale ?? 1.0,
      entryPunchDuration: instruction.clip.entryPunchDuration ?? 0.15,
      kenBurnsIntensity: instruction.clip.kenBurnsIntensity ?? 0,
    };

    if (instruction.mediaType === "photo") {
      await renderPhotoClip(ctx, canvas, instruction, watermarkText, clipStyle, transType, crossfadeFrom, i - 1, beatGrid, clipDuration, (pct) => {
        onProgress(Math.min(99, ((elapsedTotal + (pct / 100) * clipDuration) / totalDuration) * 100));
      }, watermarkOpacity, captionEntranceDuration, captionExitDuration, neonColors, photoDisplayDuration, beatSyncToleranceMs, aiRenderOpts, elapsedTotal);
    } else {
      await renderVideoClip(ctx, canvas, instruction, watermarkText, clipStyle, transType, crossfadeFrom, i - 1, beatGrid, clipDuration, audioPipeline, (pct) => {
        onProgress(Math.min(99, ((elapsedTotal + (pct / 100) * clipDuration) / totalDuration) * 100));
      }, watermarkOpacity, captionEntranceDuration, captionExitDuration, neonColors, beatSyncToleranceMs, aiRenderOpts, elapsedTotal);
    }

    // Save first frame for seamless loop
    if (i === 0 && viralOptions.seamlessLoop) {
      firstFrameCanvas = document.createElement("canvas");
      firstFrameCanvas.width = canvas.width;
      firstFrameCanvas.height = canvas.height;
      // We'll capture it after the first render frame (already drawn on canvas)
      firstFrameCanvas.getContext("2d")!.drawImage(canvas, 0, 0);
    }

    if (i < clips.length - 1) {
      if (!crossfadeCanvas) {
        crossfadeCanvas = document.createElement("canvas");
        crossfadeCanvas.width = canvas.width;
        crossfadeCanvas.height = canvas.height;
      }
      crossfadeCanvas.getContext("2d")!.drawImage(canvas, 0, 0);
    }

    elapsedTotal += clipDuration;
    // Subtract transition overlap to keep elapsedTotal aligned with totalDuration
    if (i < clips.length - 1) {
      elapsedTotal -= clips[i + 1]?.clip.transitionDuration ?? defaultTransitionDuration;
    }
  }

  // Seamless loop: cross-fade last frame into first frame
  if (viralOptions.seamlessLoop && firstFrameCanvas) {
    await renderLoopCrossfade(ctx, canvas, firstFrameCanvas, loopCrossfadeDuration);
  }

  recorder.stop();

  return new Promise((resolve) => {
    recorder.onstop = () => {
      audioPipeline.cleanup();
      // Clean up temporary canvases
      crossfadeCanvas = null;
      firstFrameCanvas = null;
      onProgress(100);
      const blobType = mimeType.includes("mp4") ? "video/mp4" : "video/webm";
      resolve(new Blob(chunks, { type: blobType }));
    };
  });
}

/**
 * Render the seamless loop crossfade at the end of the tape.
 * Blends the current canvas (last frame) with the first frame over the given duration.
 */
function renderLoopCrossfade(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  firstFrameCanvas: HTMLCanvasElement,
  durationSec: number
): Promise<void> {
  return new Promise((resolve) => {
    // Save the last frame
    const lastFrameCanvas = document.createElement("canvas");
    lastFrameCanvas.width = canvas.width;
    lastFrameCanvas.height = canvas.height;
    lastFrameCanvas.getContext("2d")!.drawImage(canvas, 0, 0);

    const totalFrames = Math.max(1, Math.round(durationSec * EXPORT_FRAME_RATE));
    let frame = 0;

    const drawFrame = () => {
      if (frame >= totalFrames) {
        resolve();
        return;
      }

      const progress = frame / totalFrames;

      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw last frame fading out
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(lastFrameCanvas, 0, 0);
      ctx.restore();

      // Draw first frame fading in
      ctx.save();
      ctx.globalAlpha = progress;
      ctx.drawImage(firstFrameCanvas, 0, 0);
      ctx.restore();

      frame++;
      requestAnimationFrame(drawFrame);
    };

    requestAnimationFrame(drawFrame);
  });
}

/** AI rendering options passed through to export render functions */
interface ExportAiRenderOptions {
  beatPulseIntensity?: number;
  beatFlashOpacity?: number;
  captionFontSize?: number;
  captionVerticalPosition?: number;
  captionShadowColor?: string;
  captionShadowBlur?: number;
  flashOverlayAlpha?: number;
  zoomPunchFlashAlpha?: number;
  colorFlashAlpha?: number;
  strobeFlashCount?: number;
  strobeFlashAlpha?: number;
  lightLeakColor?: string;
  glitchColors?: [string, string];
}

function renderVideoClip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  instruction: RenderClipInstruction,
  watermarkText: string | null,
  style: ReturnType<typeof getEditingStyle>,
  transType: TransitionType | null,
  crossfadeFrom: HTMLCanvasElement | null,
  transitionSeed: number,
  beatGrid: BeatGrid | null,
  canvasDuration: number,
  audioPipeline: AudioPipeline,
  onProgress: (pct: number) => void,
  wmOpacity: number = 0.4,
  captionEntrance: number = 0.5,
  captionExit: number = 0.3,
  neonColorHexes?: string[],
  beatTolerance: number = 50,
  aiRenderOpts?: ExportAiRenderOptions,
  globalTimelineOffset: number = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!instruction.mediaUrl) {
      console.warn(`Export: skipping clip "${instruction.clip.id}" — no media URL`);
      resolve();
      return;
    }
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = instruction.mediaUrl;
    video.preload = "auto";
    // Route original audio through the audio pipeline (not muted)
    const disconnectAudio = audioPipeline.connectVideo(video);

    video.onloadeddata = () => {
      const va = video.videoWidth / video.videoHeight;
      const ca = canvas.width / canvas.height;
      let baseW: number, baseH: number;
      const isCardClip = instruction.clip.id === "__intro__" || instruction.clip.id === "__outro__";
      if (isCardClip) {
        // Contain-fit for intro/outro cards: show full video without cropping
        if (va > ca) { baseW = canvas.width; baseH = baseW / va; }
        else { baseH = canvas.height; baseW = baseH * va; }
      } else {
        // Cover-fit for regular clips: fill canvas, crop if needed
        if (va > ca) { baseH = canvas.height; baseW = baseH * va; }
        else { baseW = canvas.width; baseH = baseW / va; }
      }

      const { trimStart, trimEnd } = instruction.clip;
      const velocityPreset = instruction.clip.velocityPreset ?? "normal";
      video.currentTime = trimStart;

      video.onseeked = () => {
        video.play();

        const renderStartTime = performance.now();
        const canvasDurationMs = canvasDuration * 1000;

        const drawFrame = () => {
          const canvasElapsedMs = performance.now() - renderStartTime;
          const canvasElapsedSec = canvasElapsedMs / 1000;
          const globalTime = globalTimelineOffset + canvasElapsedSec;

          if (canvasElapsedMs >= canvasDurationMs || video.paused) {
            video.pause();
            disconnectAudio();
            video.src = "";
            video.removeAttribute("src");
            video.load();
            resolve();
            return;
          }

          // Stop if video reached trim end
          if (video.currentTime >= trimEnd) {
            // Hold last frame for remaining canvas time — redraw video frame + overlays
            if (canvasElapsedMs < canvasDurationMs) {
              onProgress(Math.min(99, (canvasElapsedMs / canvasDurationMs) * 100));
              // Redraw the held video frame to clear previous overlay compositing
              ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              ctx.filter = "none";
              drawOverlays(ctx, canvas, watermarkText, instruction.captionText, instruction.captionStyle, canvasElapsedSec, canvasDuration, buildCaptionCustom(instruction.clip), wmOpacity, captionEntrance, captionExit, aiRenderOpts);
              requestAnimationFrame(drawFrame);
              return;
            }
            video.pause();
            disconnectAudio();
            video.src = "";
            video.removeAttribute("src");
            video.load();
            resolve();
            return;
          }

          onProgress(Math.min(99, (canvasElapsedMs / canvasDurationMs) * 100));

          // Apply velocity — custom keyframes take priority over presets
          const customKf = instruction.clip.customVelocityKeyframes;
          if (customKf && customKf.length >= 2) {
            const posInClip = Math.min(1, canvasElapsedSec / canvasDuration);
            const speed = getSpeedFromKeyframes(posInClip, customKf);
            const clampedSpeed = Math.max(0.05, Math.min(5, speed));
            if (Math.abs(video.playbackRate - clampedSpeed) > 0.05) {
              video.playbackRate = clampedSpeed;
            }
          } else if (velocityPreset !== "normal") {
            const posInClip = Math.min(1, canvasElapsedSec / canvasDuration);
            const speed = getSpeedAtPosition(posInClip, velocityPreset);
            const clampedSpeed = Math.max(0.05, Math.min(5, speed));
            if (Math.abs(video.playbackRate - clampedSpeed) > 0.05) {
              video.playbackRate = clampedSpeed;
            }
          }

          const entryScale = getClipEntryScale(canvasElapsedSec, style.entryPunchScale, style.entryPunchDuration);

          // Ken Burns — slow zoom over clip duration (AI controls intensity)
          const kenBurnsScale = 1 + (canvasElapsedMs / canvasDurationMs) * (style.kenBurnsIntensity ?? 0);

          // Beat pulse — AI controls intensity (use global timeline time for beat sync)
          let beatPulse = 1;
          let currentBeatIntensity = 0;
          if (beatGrid) {
            currentBeatIntensity = getBeatIntensity(globalTime, beatGrid, beatTolerance);
            beatPulse = 1 + currentBeatIntensity * (aiRenderOpts?.beatPulseIntensity ?? 0.015);
          }

          if (crossfadeFrom && transType && canvasElapsedSec < style.transitionDuration) {
            const progress = canvasElapsedSec / style.transitionDuration;
            renderTransitionFrame(ctx, canvas, crossfadeFrom, transType, progress, transitionSeed, () => {
              const inTransform = getTransitionTransform(transType, progress, false, canvas.width);
              const totalScale = inTransform.scale * entryScale * beatPulse * kenBurnsScale;
              const dw = baseW * totalScale;
              const dh = baseH * totalScale;
              const dx = (canvas.width - dw) / 2 + inTransform.offsetX;
              const dy = (canvas.height - dh) / 2 + inTransform.offsetY;
              ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
              ctx.drawImage(video, dx, dy, dw, dh);
              ctx.filter = "none";
            }, neonColorHexes, aiRenderOpts);
          } else {
            const totalScale = entryScale * beatPulse * kenBurnsScale;
            const dw = baseW * totalScale;
            const dh = baseH * totalScale;
            const dx = (canvas.width - dw) / 2;
            const dy = (canvas.height - dh) / 2;
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
            ctx.drawImage(video, dx, dy, dw, dh);
            ctx.filter = "none";
          }

          // Beat flash overlay — matches TapePreviewPlayer behavior
          if (beatGrid) {
            const beatInt = currentBeatIntensity;
            const beatFlashMax = aiRenderOpts?.beatFlashOpacity ?? 0.12;
            if (beatInt > 0.5 && beatFlashMax > 0) {
              ctx.save();
              ctx.globalAlpha = (beatInt - 0.5) * beatFlashMax;
              ctx.fillStyle = "white";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.restore();
            }
          }

          drawOverlays(ctx, canvas, watermarkText, instruction.captionText, instruction.captionStyle, canvasElapsedSec, canvasDuration, buildCaptionCustom(instruction.clip), wmOpacity, captionEntrance, captionExit, aiRenderOpts);
          requestAnimationFrame(drawFrame);
        };

        requestAnimationFrame(drawFrame);
      };
    };

    video.onerror = (e) => {
      const clipId = instruction.clip.id;
      const src = instruction.mediaUrl?.slice(0, 80);
      console.error(`Export: video load failed for clip "${clipId}", src="${src}"`, e);
      disconnectAudio();
      video.src = "";
      video.removeAttribute("src");
      video.load();
      reject(new Error(`Failed to load video for clip "${clipId}" — the media URL may have expired or the format is unsupported. src: ${src}`));
    };
  });
}

function renderPhotoClip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  instruction: RenderClipInstruction,
  watermarkText: string | null,
  style: ReturnType<typeof getEditingStyle>,
  transType: TransitionType | null,
  crossfadeFrom: HTMLCanvasElement | null,
  transitionSeed: number,
  beatGrid: BeatGrid | null,
  canvasDuration: number,
  onProgress: (pct: number) => void,
  wmOpacity: number = 0.4,
  captionEntrance: number = 0.5,
  captionExit: number = 0.3,
  neonColorHexes?: string[],
  photoDisplayDur: number = 3,
  beatTolerance: number = 50,
  aiRenderOpts?: ExportAiRenderOptions,
  globalTimelineOffset: number = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!instruction.mediaUrl) {
      console.warn(`Export: skipping photo clip "${instruction.clip.id}" — no media URL`);
      resolve();
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const ia = img.width / img.height;
      const ca = canvas.width / canvas.height;
      let baseW: number, baseH: number;
      const isCardClip = instruction.clip.id === "__intro__" || instruction.clip.id === "__outro__";
      if (isCardClip) {
        // Contain-fit for intro/outro cards: show full image without cropping
        if (ia > ca) { baseW = canvas.width; baseH = baseW / ia; }
        else { baseH = canvas.height; baseW = baseH * ia; }
      } else if (ia > ca) { baseH = canvas.height; baseW = baseH * ia; }
      else { baseW = canvas.width; baseH = baseW / ia; }

      const durationMs = (canvasDuration > 0 ? canvasDuration : photoDisplayDur) * 1000;
      const transitionMs = style.transitionDuration * 1000;
      const startTime = performance.now();

      const drawFrame = () => {
        const elapsedMs = performance.now() - startTime;
        if (elapsedMs >= durationMs) { onProgress(100); img.src = ""; resolve(); return; }

        const elapsedSec = elapsedMs / 1000;
        const globalTime = globalTimelineOffset + elapsedSec;
        onProgress((elapsedMs / durationMs) * 100);

        const kenBurnsScale = 1 + (elapsedMs / durationMs) * style.kenBurnsIntensity;
        const entryScale = getClipEntryScale(elapsedSec, style.entryPunchScale, style.entryPunchDuration);

        // Beat pulse — AI controls intensity (use global timeline time for beat sync)
        let beatPulse = 1;
        let currentBeatIntensity = 0;
        if (beatGrid) {
          currentBeatIntensity = getBeatIntensity(globalTime, beatGrid, beatTolerance);
          beatPulse = 1 + currentBeatIntensity * (aiRenderOpts?.beatPulseIntensity ?? 0.015);
        }

        if (crossfadeFrom && transType && elapsedMs < transitionMs) {
          const progress = elapsedMs / transitionMs;
          renderTransitionFrame(ctx, canvas, crossfadeFrom, transType, progress, transitionSeed, () => {
            const inTransform = getTransitionTransform(transType, progress, false, canvas.width);
            const totalScale = kenBurnsScale * entryScale * inTransform.scale * beatPulse;
            const dw = baseW * totalScale;
            const dh = baseH * totalScale;
            const dx = (canvas.width - dw) / 2 + inTransform.offsetX;
            const dy = (canvas.height - dh) / 2 + inTransform.offsetY;
            ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
            ctx.drawImage(img, dx, dy, dw, dh);
            ctx.filter = "none";
          }, neonColorHexes, aiRenderOpts);
        } else {
          const totalScale = kenBurnsScale * entryScale * beatPulse;
          const dw = baseW * totalScale;
          const dh = baseH * totalScale;
          const dx = (canvas.width - dw) / 2;
          const dy = (canvas.height - dh) / 2;
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
          ctx.drawImage(img, dx, dy, dw, dh);
          ctx.filter = "none";
        }

        // Beat flash overlay — matches TapePreviewPlayer behavior
        if (beatGrid) {
          const beatFlashMax = aiRenderOpts?.beatFlashOpacity ?? 0.12;
          if (currentBeatIntensity > 0.5 && beatFlashMax > 0) {
            ctx.save();
            ctx.globalAlpha = (currentBeatIntensity - 0.5) * beatFlashMax;
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
        }

        drawOverlays(ctx, canvas, watermarkText, instruction.captionText, instruction.captionStyle, elapsedSec, canvasDuration || photoDisplayDur, buildCaptionCustom(instruction.clip), wmOpacity, captionEntrance, captionExit, aiRenderOpts);
        requestAnimationFrame(drawFrame);
      };

      requestAnimationFrame(drawFrame);
    };

    img.onerror = (e) => {
      const clipId = instruction.clip.id;
      console.error(`Export: image load failed for clip "${clipId}"`, e);
      img.src = "";
      reject(new Error(`Failed to load image for clip "${clipId}" — the media URL may have expired`));
    };
    img.src = instruction.mediaUrl;
  });
}

/**
 * Composite one transition frame: outgoing + incoming + overlay.
 */
function renderTransitionFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  crossfadeFrom: HTMLCanvasElement,
  transType: TransitionType,
  progress: number,
  seed: number,
  drawIncoming: () => void,
  neonColorHexes?: string[],
  aiRenderOpts?: ExportAiRenderOptions
) {
  const outAlpha = getClipAlpha(transType, progress, true);
  const inAlpha = getClipAlpha(transType, progress, false);
  const outTransform = getTransitionTransform(transType, progress, true, canvas.width);

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw outgoing frame
  if (outAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = outAlpha;
    const ow = canvas.width * outTransform.scale;
    const oh = canvas.height * outTransform.scale;
    const ox = (canvas.width - ow) / 2 + outTransform.offsetX;
    const oy = (canvas.height - oh) / 2 + outTransform.offsetY;
    ctx.drawImage(crossfadeFrom, ox, oy, ow, oh);
    ctx.restore();
  }

  // Draw incoming frame
  if (inAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = inAlpha;
    drawIncoming();
    ctx.restore();
  }

  // Overlay effect
  ctx.globalAlpha = 1;
  drawTransitionOverlay(ctx, canvas.width, canvas.height, transType, progress, seed, neonColorHexes, aiRenderOpts);
}

function buildCaptionCustom(clip: EditedClip): CustomCaptionParams | undefined {
  if (!clip.customCaptionAnimation && !clip.customCaptionFontWeight && !clip.customCaptionColor && !clip.customCaptionGlowColor) {
    return undefined;
  }
  return {
    animation: clip.customCaptionAnimation,
    fontWeight: clip.customCaptionFontWeight,
    fontStyle: clip.customCaptionFontStyle,
    fontFamily: clip.customCaptionFontFamily,
    color: clip.customCaptionColor,
    glowColor: clip.customCaptionGlowColor,
    glowRadius: clip.customCaptionGlowRadius,
  };
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  watermarkText: string | null,
  captionText: string,
  captionStyle: CaptionStyle,
  localTime: number,
  clipDuration: number,
  captionCustom?: CustomCaptionParams,
  wmOpacity: number = 0.4,
  captionEntrance: number = 0.5,
  captionExit: number = 0.3,
  aiRenderOpts?: ExportAiRenderOptions
) {
  if (watermarkText) {
    ctx.save();
    ctx.globalAlpha = wmOpacity;
    ctx.font = "bold 28px -apple-system, sans-serif";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(watermarkText, canvas.width / 2, canvas.height - 60);
    ctx.restore();
  }

  // Kinetic text instead of static caption
  if (captionText) {
    const kTransform = getKineticTransform(captionStyle, localTime, clipDuration, canvas.height, captionCustom, captionEntrance, captionExit);
    const fontSize = Math.round(canvas.height * (aiRenderOpts?.captionFontSize ?? 0.025));
    drawKineticCaption(
      ctx,
      captionText,
      captionStyle,
      kTransform,
      canvas.width,
      canvas.height,
      fontSize,
      captionCustom,
      aiRenderOpts?.captionVerticalPosition,
      aiRenderOpts?.captionShadowColor,
      aiRenderOpts?.captionShadowBlur
    );
  }
}
