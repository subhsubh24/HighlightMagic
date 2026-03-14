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
    const defaultTransDur = plan?.defaultTransitionDuration ?? 0.28;
    const voDelay = plan?.voiceover?.delaySec ?? 0.28;
    const musicVol = plan?.musicVolume ?? 0.47;
    const sfxVol = plan?.sfxVolume ?? 0.78;
    const voVol = plan?.voiceoverVolume ?? 0.95;

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
      const rawDur = clips[i].trimEnd - clips[i].trimStart;
      const dur = getEffectiveDuration(rawDur, clips[i].velocityPreset, clips[i].customVelocityKeyframes);
      clipStarts.push(t);
      clipEnds.push(t + dur);
      t += dur - (clips[i + 1]?.transitionDuration ?? defaultTransDur);
    }

    // Voiceover segments — use per-segment delay when available for natural timing
    for (const vo of state.voiceoverSegments ?? []) {
      if (!vo.audioUrl || vo.status !== "completed") continue;
      const start = clipStarts[vo.clipIndex];
      if (start == null) continue;
      const segDelay = vo.delaySec ?? voDelay;
      audioLayers.push({ url: vo.audioUrl, startTime: start + segDelay, volume: voVol });
    }

    // SFX tracks
    for (const sfx of state.sfxTracks ?? []) {
      if (!sfx.audioUrl || sfx.status !== "completed") continue;
      const clipStart = clipStarts[sfx.clipIndex];
      const clipEnd = clipEnds[sfx.clipIndex];
      if (clipStart == null) continue;
      let sfxStart = clipStart;
      if (sfx.timing === "before") sfxStart = Math.max(0, clipStart - sfx.durationMs / 1000);
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
  const thumbnailAbortRef = useRef<AbortController | null>(null);

  // Cleanup blob URL and abort thumbnail polling on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      thumbnailAbortRef.current?.abort();
    };
  }, [blobUrl]);

  const sortedClips = [...state.clips].sort((a, b) => a.order - b.order);
  const defaultTransDurPreview = state.aiProductionPlan?.defaultTransitionDuration ?? 0.28;
  const totalDuration = sortedClips.reduce((sum, c, i) => {
    const sourceDur = c.trimEnd - c.trimStart;
    let dur = sum + getEffectiveDuration(sourceDur, c.velocityPreset, c.customVelocityKeyframes);
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

    // Fresh blob URLs created for this export — cleaned up when done
    const exportBlobUrls: string[] = [];
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
      const defaultTransDurC = cPlan?.defaultTransitionDuration ?? 0.28;
      const voDelayC = cPlan?.voiceover?.delaySec ?? 0.28;
      const sfxVolC = cPlan?.sfxVolume ?? 0.78;
      const voVolC = cPlan?.voiceoverVolume ?? 0.95;

      // Pre-fetch remote intro/outro videos through a same-origin proxy to avoid
      // canvas tainting. Cross-origin videos drawn to canvas taint it, causing
      // captureStream() to produce blank frames.
      // Pre-fetch with retry (up to 3 attempts with exponential backoff)
      async function fetchVideoBlob(videoUrl: string, label: string): Promise<string> {
        const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
            const blob = await res.blob();
            console.log(`Export: pre-fetched ${label} video as blob (${blob.size} bytes, type=${blob.type})`);
            const blobUrl = URL.createObjectURL(blob);
            exportBlobUrls.push(blobUrl);
            return blobUrl;
          } catch (e) {
            if (attempt < 2) {
              console.warn(`Export: ${label} pre-fetch attempt ${attempt + 1} failed, retrying...`, e);
            } else {
              console.warn(`Export: failed to pre-fetch ${label} video after 3 attempts, using remote URL`, e);
              return videoUrl;
            }
          }
        }
        return videoUrl;
      }

      let introBlobUrl: string | null = null;
      let outroBlobUrl: string | null = null;
      if (hasIntroC) {
        introBlobUrl = await fetchVideoBlob(state.introCard!.videoUrl!, "intro");
      }
      if (hasOutroC) {
        outroBlobUrl = await fetchVideoBlob(state.outroCard!.videoUrl!, "outro");
      }

      // Pre-fetch animated photo videos through same-origin proxy to avoid canvas tainting.
      // These are remote URLs from Atlas Cloud / Kling — drawing cross-origin videos to
      // canvas taints it, causing captureStream() to produce blank frames for the entire export.
      const animatedBlobUrls = new Map<string, string>();
      const animatedMedia = sortedClips
        .map((clip) => {
          const media = getMediaFile(state, clip.sourceFileId);
          if (media?.type === "photo" && media.animationStatus === "completed" && media.animatedVideoUrl) {
            return { fileId: media.id, url: media.animatedVideoUrl };
          }
          return null;
        })
        .filter((x): x is { fileId: string; url: string } => x !== null);

      // Fetch animated videos in parallel for speed
      await Promise.all(
        animatedMedia.map(async ({ fileId, url }) => {
          const blobUrl = await fetchVideoBlob(url, `animated-photo-${fileId}`);
          animatedBlobUrls.set(fileId, blobUrl);
        })
      );

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
          mediaUrl: introBlobUrl!,
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
        // For local files, create a fresh blob URL from the File object to guarantee
        // validity — the original blob URL from upload may have been revoked or expired.
        let mediaUrl: string;
        if (hasAnimatedVideo) {
          // Use pre-fetched blob URL to avoid canvas tainting from cross-origin video
          mediaUrl = animatedBlobUrls.get(media.id) ?? media.animatedVideoUrl!;
        } else if (media?.file) {
          mediaUrl = URL.createObjectURL(media.file);
          exportBlobUrls.push(mediaUrl);
        } else {
          mediaUrl = media?.url ?? "";
        }
        console.log(`Export: clip "${clip.id}" source="${clip.sourceFileId}" mediaType=${media?.type} animated=${!!hasAnimatedVideo} hasFile=${!!media?.file} fileSize=${media?.file?.size ?? 0} fileType=${media?.file?.type ?? "n/a"} url=${mediaUrl.slice(0, 60)}`);
        renderClips.push({
          clip,
          mediaUrl,
          mediaType: hasAnimatedVideo ? "video" as const : (media?.type ?? "video"),
          filterCSS: clip.customFilterCSS ?? VIDEO_FILTERS[clip.selectedFilter],
          captionText: clip.captionText,
          captionStyle: clip.captionStyle,
          mediaFile: (!hasAnimatedVideo && media?.file) ? media.file : undefined,
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
          mediaUrl: outroBlobUrl!,
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
          const rawDur = sortedClips[i].trimEnd - sortedClips[i].trimStart;
          // Account for velocity curves — effective duration may differ from source
          let dur = getEffectiveDuration(rawDur, sortedClips[i].velocityPreset, sortedClips[i].customVelocityKeyframes);
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
          const segDelay = vo.delaySec ?? voDelayC;
          scheduled.push({ url: vo.audioUrl, startTime: s + segDelay, volume: voVolC, layerType: "voiceover" });
        }
        for (const sfx of state.sfxTracks ?? []) {
          if (!sfx.audioUrl || sfx.status !== "completed") continue;
          const cs = cStarts[sfx.clipIndex];
          const ce = cEnds[sfx.clipIndex];
          if (cs == null) continue;
          let sfxS = cs;
          // Use AI-decided SFX duration for "before" lead-in instead of fixed offset
          if (sfx.timing === "before") sfxS = Math.max(0, cs - sfx.durationMs / 1000);
          else if (sfx.timing === "after") sfxS = (ce ?? cs) - defaultTransDurC;
          scheduled.push({ url: sfx.audioUrl, startTime: sfxS, volume: sfxVolC, layerType: "sfx" });
        }
      }

      // Voiceover-aware clip extension: ensure clips are long enough for their audio.
      // If a voiceover segment is longer than its clip, extend the clip's canvas duration
      // so the video holds its last frame while the VO finishes — no awkward cutoff.
      const renderClipIntroOffset = hasIntroC ? 1 : 0;
      for (const vo of state.voiceoverSegments ?? []) {
        if (!vo.audioUrl || vo.status !== "completed" || vo.duration <= 0) continue;
        const renderIdx = vo.clipIndex + renderClipIntroOffset;
        const rc = validRenderClips[renderIdx];
        if (!rc) continue;
        const voEndInClip = (vo.delaySec ?? voDelayC) + vo.duration;
        // Only extend if VO+delay exceeds the clip's natural duration
        rc.minCanvasDuration = Math.max(rc.minCanvasDuration ?? 0, voEndInClip);
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
        cPlan?.musicVolume ?? 0.47,
        cPlan?.musicDuckRatio ?? 0.28,
        cPlan?.musicDuckAttack ?? 0.18,
        cPlan?.musicDuckRelease ?? 0.32,
        cPlan?.musicFadeInDuration ?? 0,
        cPlan?.musicFadeOutDuration ?? 0,
        cPlan?.loopCrossfadeDuration ?? 0.47,
        cPlan?.exportBitrate ?? 12_000_000,
        cPlan?.watermarkOpacity ?? 0.38,
        cPlan?.captionEntranceDuration ?? 0.45,
        cPlan?.captionExitDuration ?? 0.28,
        cPlan?.neonColors,
        cPlan?.photoDisplayDuration ?? 3.2,
        cPlan?.beatSyncToleranceMs ?? 47,
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
          defaultEntryPunchScale: cPlan.defaultEntryPunchScale,
          defaultEntryPunchDuration: cPlan.defaultEntryPunchDuration,
          defaultKenBurnsIntensity: cPlan.defaultKenBurnsIntensity,
          grainOpacity: cPlan.grainOpacity,
          vignetteIntensity: cPlan.vignetteIntensity,
          vignetteTightness: cPlan.vignetteTightness,
          captionAppearDelay: cPlan.captionAppearDelay,
          exitDecelSpeed: cPlan.exitDecelSpeed,
          exitDecelDuration: cPlan.exitDecelDuration,
          settleScale: cPlan.settleScale,
          settleDuration: cPlan.settleDuration,
          clipAudioVolume: cPlan.clipAudioVolume,
          finalClipWarmth: cPlan.finalClipWarmth,
          filmStock: cPlan.filmStock,
          audioBreaths: cPlan.audioBreaths,
          beatFlashThreshold: cPlan.beatFlashThreshold,
          beatFlashColor: cPlan.beatFlashColor,
          vignetteHardness: cPlan.vignetteHardness,
          watermarkFontSize: cPlan.watermarkFontSize,
          watermarkYOffset: cPlan.watermarkYOffset,
          settleEasing: cPlan.settleEasing,
          exitDecelEasing: cPlan.exitDecelEasing,
          letterboxColor: cPlan.letterboxColor,
          captionExitAnimation: cPlan.captionExitAnimation,
          watermarkColor: cPlan.watermarkColor,
          grainBlockSize: cPlan.grainBlockSize,
          lightLeakOpacity: cPlan.lightLeakOpacity,
          hardFlashDarkenPhase: cPlan.hardFlashDarkenPhase,
          hardFlashBlastPhase: cPlan.hardFlashBlastPhase,
          glitchScanlineCount: cPlan.glitchScanlineCount,
          glitchBandWidth: cPlan.glitchBandWidth,
          whipBlurLineCount: cPlan.whipBlurLineCount,
          whipBrightnessAlpha: cPlan.whipBrightnessAlpha,
          hardCutBumpAlpha: cPlan.hardCutBumpAlpha,
          captionPopStartScale: cPlan.captionPopStartScale,
          captionPopExitScale: cPlan.captionPopExitScale,
          captionSlideExitDistance: cPlan.captionSlideExitDistance,
          captionFadeExitOffset: cPlan.captionFadeExitOffset,
          captionFlickerSpeed: cPlan.captionFlickerSpeed,
          captionPopIdleFreq: cPlan.captionPopIdleFreq,
          captionFlickerIdleFreq: cPlan.captionFlickerIdleFreq,
          captionBoldSizeMultiplier: cPlan.captionBoldSizeMultiplier,
          captionMinimalSizeMultiplier: cPlan.captionMinimalSizeMultiplier,
          captionPopOvershoot: cPlan.captionPopOvershoot,
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
      // Clean up fresh blob URLs created for this export
      exportBlobUrls.forEach((u) => URL.revokeObjectURL(u));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- generateThumbnail is stable and called conditionally at end of export
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
  /** Override canvas duration to hold clip longer (e.g. for voiceover that extends past the visual) */
  minCanvasDuration?: number;
  /** Original File/Blob for photos — used by createImageBitmap to avoid blob URL issues */
  mediaFile?: File | Blob;
}

/**
 * Micro-settle easing — gives each clip a subtle "landing" feel.
 * In the first SETTLE_DURATION seconds, the clip has a tiny extra scale and Y offset
 * that eases out with cubic-out, simulating the physical settle of a camera cut.
 * Returns {scale, offsetY} — multiply scale into totalScale, add offsetY to dy.
 */
function applyEasing(t: number, easing: string): number {
  switch (easing) {
    case "linear": return t;
    case "quad": return 1 - (1 - t) * (1 - t);
    case "expo": return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    case "cubic":
    default: return 1 - Math.pow(1 - t, 3);
  }
}

function getMicroSettle(elapsedSec: number, settleScale: number = 1.006, settleDuration: number = 0.18, easing: string = "cubic"): { scale: number; offsetY: number } {
  if (settleScale <= 1.0 || settleDuration <= 0 || elapsedSec >= settleDuration) return { scale: 1, offsetY: 0 };
  const t = Math.min(1, elapsedSec / settleDuration);
  const ease = applyEasing(t, easing);
  const scale = settleScale + (1 - settleScale) * ease;
  const offsetY = -2 * (settleScale - 1) / 0.006 * (1 - ease);
  return { scale, offsetY };
}

/**
 * End-of-clip micro-deceleration — subtle slowdown in the last 0.15s.
 * Returns a speed multiplier (0.96-1.0) that creates a "weight" before the cut.
 */
function getExitDeceleration(elapsedSec: number, clipDuration: number, minSpeed: number = 0.96, decelDuration: number = 0.14, easing: string = "quad"): number {
  if (minSpeed >= 1.0 || decelDuration <= 0) return 1.0;
  const remaining = clipDuration - elapsedSec;
  if (remaining >= decelDuration || remaining <= 0) return 1.0;
  const t = 1 - remaining / decelDuration;
  const ease = applyEasing(t, easing);
  return 1.0 + (minSpeed - 1.0) * ease;
}

/**
 * Film grain overlay — draws subtle noise texture on the canvas.
 * Uses a seeded PRNG per-frame for consistent-looking grain.
 * Opacity 0.04-0.06 = professional film stock feel.
 */
let _grainCanvas: HTMLCanvasElement | null = null;
let _grainCtx: CanvasRenderingContext2D | null = null;
let _grainBlock: number = 4;
function drawFilmGrain(ctx: CanvasRenderingContext2D, w: number, h: number, opacity: number = 0.045, blockSize: number = 4) {
  if (opacity <= 0) return;
  // Lazy-init a small grain canvas (render at reduced res for perf, scale up)
  const gw = Math.ceil(w / blockSize);
  const gh = Math.ceil(h / blockSize);
  if (!_grainCanvas || _grainCanvas.width !== gw || _grainCanvas.height !== gh || _grainBlock !== blockSize) {
    _grainBlock = blockSize;
    _grainCanvas = document.createElement("canvas");
    _grainCanvas.width = gw;
    _grainCanvas.height = gh;
    _grainCtx = _grainCanvas.getContext("2d")!;
  }
  const gCtx = _grainCtx!;
  const imageData = gCtx.createImageData(gw, gh);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() * 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  gCtx.putImageData(imageData, 0, 0);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = "overlay";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_grainCanvas, 0, 0, w, h);
  ctx.restore();
}

/**
 * Vignette overlay — radial gradient darkening at edges.
 * Creates the "lens" quality that pro edits have.
 */
let _vignetteCanvas: HTMLCanvasElement | null = null;
let _vignetteTightness: number = 0.45;
let _vignetteHardness: number = 0.48;
function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number = 0.18, tightness: number = 0.45, hardness: number = 0.48) {
  if (intensity <= 0) return;
  // Cache the vignette gradient on a canvas — invalidate when params change
  if (!_vignetteCanvas || _vignetteCanvas.width !== w || _vignetteCanvas.height !== h || _vignetteTightness !== tightness || _vignetteHardness !== hardness) {
    _vignetteCanvas = document.createElement("canvas");
    _vignetteCanvas.width = w;
    _vignetteCanvas.height = h;
    _vignetteTightness = tightness;
    _vignetteHardness = hardness;
    const vCtx = _vignetteCanvas.getContext("2d")!;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.sqrt(cx * cx + cy * cy);
    const innerR = Math.max(0.1, Math.min(0.8, tightness));
    const grad = vCtx.createRadialGradient(cx, cy, radius * innerR, cx, cy, radius);
    // Hardness controls where the mid-stop sits: 0 = smooth, 1 = sharp
    const h_ = Math.max(0, Math.min(1, hardness));
    const midStop = 0.4 + h_ * 0.45;  // 0.4 (smooth) → 0.85 (sharp)
    const midAlpha = 0.08 + h_ * 0.25; // 0.08 (soft) → 0.33 (punchy)
    const edgeAlpha = 0.35 + h_ * 0.35; // 0.35 (dreamy) → 0.70 (hard)
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(midStop, `rgba(0,0,0,${midAlpha})`);
    grad.addColorStop(1, `rgba(0,0,0,${edgeAlpha})`);
    vCtx.fillStyle = grad;
    vCtx.fillRect(0, 0, w, h);
  }
  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.drawImage(_vignetteCanvas, 0, 0);
  ctx.restore();
}

/**
 * Warmth shift for final clip — subtle warm grade on the last 2s.
 * Creates the visual equivalent of a musical resolve.
 */
/**
 * Film stock base post-processing — applied after the clip is drawn.
 * Creates the coherent "film look" that ties all clips together.
 */
/** Scale a transition transform by intensity (0-1). 1.0 = full effect, 0 = no effect. */
function scaleTransform(t: { scale: number; offsetX: number; offsetY: number }, intensity: number): { scale: number; offsetX: number; offsetY: number } {
  if (intensity >= 1.0) return t;
  return {
    scale: 1 + (t.scale - 1) * intensity,
    offsetX: t.offsetX * intensity,
    offsetY: t.offsetY * intensity,
  };
}

function applyFilmStock(ctx: CanvasRenderingContext2D, w: number, h: number, stock: { grain: number; warmth: number; contrast: number; fadedBlacks: number } | undefined) {
  if (!stock) return;
  // Apply contrast + warmth via CSS filter on a self-draw
  const parts: string[] = [];
  if (stock.contrast !== 1.0) parts.push(`contrast(${stock.contrast.toFixed(3)})`);
  if (stock.warmth > 0) parts.push(`sepia(${stock.warmth.toFixed(3)})`);
  else if (stock.warmth < 0) parts.push(`hue-rotate(${(stock.warmth * 60).toFixed(1)}deg)`);
  if (parts.length > 0) {
    ctx.filter = parts.join(" ");
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = "none";
  }
  // Faded/lifted blacks — draw a semi-transparent dark gray overlay
  if (stock.fadedBlacks > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighten";
    const gray = Math.round(stock.fadedBlacks * 255);
    ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  // Film stock grain stacks with the per-frame grain overlay
  if (stock.grain > 0) {
    drawFilmGrain(ctx, w, h, stock.grain);
  }
}

function getWarmthShiftCSS(elapsedSec: number, clipDuration: number, warmth: boolean | { sepia: number; saturation: number; fadeIn: number } = true): string | null {
  if (warmth === false) return null;
  const sepiaMax = typeof warmth === "object" ? warmth.sepia : 0.06;
  const satMax = typeof warmth === "object" ? warmth.saturation : 0.04;
  const fadeIn = typeof warmth === "object" ? warmth.fadeIn : 2.0;
  const remaining = clipDuration - elapsedSec;
  if (remaining >= fadeIn) return null;
  const t = Math.min(1, (fadeIn - remaining) / fadeIn);
  const sepia = (sepiaMax * t).toFixed(3);
  const sat = (1 + satMax * t).toFixed(3);
  return `sepia(${sepia}) saturate(${sat})`;
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
  defaultTransitionDuration: number = 0.28,
  musicVolume: number = 0.47,
  musicDuckRatio: number = 0.28,
  musicDuckAttack: number = 0.18,
  musicDuckRelease: number = 0.32,
  musicFadeInDuration: number = 0,
  musicFadeOutDuration: number = 0,
  loopCrossfadeDuration: number = 0.47,
  exportBitrate: number = 12_000_000,
  watermarkOpacity: number = 0.38,
  captionEntranceDuration: number = 0.45,
  captionExitDuration: number = 0.28,
  neonColors?: string[],
  photoDisplayDuration: number = 3.2,
  beatSyncToleranceMs: number = 47,
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

  // Calculate totalDuration accounting for velocity, beat-sync, VO extension, and transition overlaps
  // (computed before audio pipeline so we can pass it for music fade-out timing)
  let totalDuration = 0;
  for (let i = 0; i < clips.length; i++) {
    const sourceDur = clips[i].clip.trimEnd - clips[i].clip.trimStart;
    let clipDur = getEffectiveDuration(sourceDur, clips[i].clip.velocityPreset, clips[i].clip.customVelocityKeyframes);
    if (beatGrid && beatGrid.beatInterval > 0) {
      const beats = Math.max(2, Math.round(clipDur / beatGrid.beatInterval));
      clipDur = beats * beatGrid.beatInterval;
    }
    // Match VO-aware extension from the render loop
    const minDur = clips[i].minCanvasDuration;
    if (minDur != null && minDur > clipDur) {
      clipDur = minDur;
    }
    totalDuration += clipDur;
    if (i < clips.length - 1) {
      totalDuration -= clips[i + 1]?.clip.transitionDuration ?? defaultTransitionDuration;
    }
  }

  // Audio pipeline: captures original clip audio + optional background music
  const canvasStream = canvas.captureStream(EXPORT_FRAME_RATE);
  const musicTrack = clips.find((c) => c.clip.selectedMusicTrack)?.clip.selectedMusicTrack ?? null;
  const audioPipeline = await createAudioPipeline(canvasStream, musicTrack, aiMusicUrl, scheduledLayers, musicVolume, musicDuckRatio, musicDuckAttack, musicDuckRelease, musicFadeInDuration, musicFadeOutDuration, totalDuration, aiRenderOpts?.clipAudioVolume, aiRenderOpts?.audioBreaths);

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
    const sourceDur = instruction.clip.trimEnd - instruction.clip.trimStart;
    let clipDuration = getEffectiveDuration(sourceDur, instruction.clip.velocityPreset, instruction.clip.customVelocityKeyframes);

    // Beat-sync: snap clip duration to beat grid
    if (beatGrid && beatGrid.beatInterval > 0) {
      const beats = Math.max(2, Math.round(clipDuration / beatGrid.beatInterval));
      clipDuration = beats * beatGrid.beatInterval;
    }

    // Extend clip to accommodate voiceover/SFX that extends past the visual
    if (instruction.minCanvasDuration && instruction.minCanvasDuration > clipDuration) {
      clipDuration = instruction.minCanvasDuration;
    }

    // Per-clip transition: AI-decided takes priority, then theme fallback
    const transType = i > 0
      ? ((instruction.clip.transitionType as TransitionType) ?? fallbackTransition)
      : null;
    const crossfadeFrom = i > 0 ? crossfadeCanvas : null;

    // Per-clip style: AI per-clip → AI plan-level default → theme default
    const clipStyle = {
      ...style,
      transitionDuration: instruction.clip.transitionDuration ?? defaultTransitionDuration,
      entryPunchScale: instruction.clip.entryPunchScale ?? aiRenderOpts?.defaultEntryPunchScale ?? style.entryPunchScale,
      entryPunchDuration: instruction.clip.entryPunchDuration ?? aiRenderOpts?.defaultEntryPunchDuration ?? style.entryPunchDuration,
      kenBurnsIntensity: instruction.clip.kenBurnsIntensity ?? aiRenderOpts?.defaultKenBurnsIntensity ?? style.kenBurnsIntensity,
    };

    console.log(`Export: rendering clip ${i + 1}/${clips.length} id="${instruction.clip.id}" type=${instruction.mediaType} dur=${clipDuration.toFixed(2)}s hasFile=${!!instruction.mediaFile} url=${instruction.mediaUrl?.slice(0, 60)}`);

    // Capture first frame callback for seamless loop
    const captureFirstFrame = (i === 0 && viralOptions.seamlessLoop)
      ? (sourceCanvas: HTMLCanvasElement) => {
          firstFrameCanvas = document.createElement("canvas");
          firstFrameCanvas.width = sourceCanvas.width;
          firstFrameCanvas.height = sourceCanvas.height;
          firstFrameCanvas.getContext("2d")!.drawImage(sourceCanvas, 0, 0);
        }
      : undefined;

    const isLastClip = i === clips.length - 1;

    if (instruction.mediaType === "photo") {
      await renderPhotoClip(ctx, canvas, instruction, watermarkText, clipStyle, transType, crossfadeFrom, i - 1, beatGrid, clipDuration, (pct) => {
        onProgress(Math.min(99, ((elapsedTotal + (pct / 100) * clipDuration) / totalDuration) * 100));
      }, watermarkOpacity, captionEntranceDuration, captionExitDuration, neonColors, photoDisplayDuration, beatSyncToleranceMs, aiRenderOpts, elapsedTotal, isLastClip);
      // For photos, capture after first render (photo is static so any frame = first frame)
      if (captureFirstFrame) captureFirstFrame(canvas);
    } else {
      await renderVideoClip(ctx, canvas, instruction, watermarkText, clipStyle, transType, crossfadeFrom, i - 1, beatGrid, clipDuration, audioPipeline, (pct) => {
        onProgress(Math.min(99, ((elapsedTotal + (pct / 100) * clipDuration) / totalDuration) * 100));
      }, watermarkOpacity, captionEntranceDuration, captionExitDuration, neonColors, beatSyncToleranceMs, aiRenderOpts, elapsedTotal, captureFirstFrame, isLastClip);
    }
    console.log(`Export: clip ${i + 1}/${clips.length} done`);

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

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      audioPipeline.cleanup();
      // Clean up temporary canvases
      crossfadeCanvas = null;
      firstFrameCanvas = null;
      onProgress(100);
      const blobType = mimeType.includes("mp4") ? "video/mp4" : "video/webm";
      resolve(new Blob(chunks, { type: blobType }));
    };
    recorder.onerror = (e) => {
      audioPipeline.cleanup();
      crossfadeCanvas = null;
      firstFrameCanvas = null;
      reject(new Error(`MediaRecorder error: ${(e as ErrorEvent).message || "unknown"}`));
    };
  });
}

/**
 * Render a solid-color placeholder for a clip's full duration so the tape
 * timeline stays intact even when a clip's media fails to load. Skipping a
 * clip entirely would shorten the tape and desync audio/transitions.
 */
function renderPlaceholderClip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  durationSec: number,
  onProgress: (pct: number) => void,
  color: string = "black"
): Promise<void> {
  return new Promise((resolve) => {
    const durationMs = durationSec * 1000;
    const startTime = performance.now();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const drawFrame = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= durationMs) {
        onProgress(100);
        resolve();
        return;
      }
      onProgress(Math.min(99, (elapsed / durationMs) * 100));
      // Redraw each frame so the MediaRecorder captures the placeholder
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      scheduleExportFrame(drawFrame);
    };
    scheduleExportFrame(drawFrame);
  });
}

/**
 * Schedule the next export frame draw without using requestAnimationFrame.
 * RAF is throttled/suspended in background tabs, which stalls exports when the
 * user switches away. MessageChannel.postMessage fires immediately regardless
 * of tab visibility, keeping the render loop alive.
 */
function scheduleExportFrame(callback: () => void) {
  const ch = new MessageChannel();
  ch.port1.onmessage = callback;
  ch.port2.postMessage(undefined);
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
      scheduleExportFrame(drawFrame);
    };

    scheduleExportFrame(drawFrame);
  });
}

/** AI rendering options passed through to export render functions */
interface ExportAiRenderOptions {
  beatPulseIntensity?: number;
  beatFlashOpacity?: number;
  beatFlashThreshold?: number;
  beatFlashColor?: string;
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
  letterboxColor?: string;
  captionExitAnimation?: string;
  defaultEntryPunchScale?: number;
  defaultEntryPunchDuration?: number;
  defaultKenBurnsIntensity?: number;
  // AI-controlled post-processing
  grainOpacity?: number;
  vignetteIntensity?: number;
  vignetteTightness?: number;
  vignetteHardness?: number;
  watermarkFontSize?: number;
  watermarkYOffset?: number;
  captionAppearDelay?: number;
  exitDecelSpeed?: number;
  exitDecelDuration?: number;
  settleScale?: number;
  settleDuration?: number;
  settleEasing?: string;
  exitDecelEasing?: string;
  clipAudioVolume?: number;
  finalClipWarmth?: boolean | { sepia: number; saturation: number; fadeIn: number };
  filmStock?: { grain: number; warmth: number; contrast: number; fadedBlacks: number };
  audioBreaths?: Array<{ time: number; duration: number; depth: number; attack?: number; release?: number }>;
  // New AI-controllable fields
  watermarkColor?: string;
  grainBlockSize?: number;
  lightLeakOpacity?: number;
  hardFlashDarkenPhase?: number;
  hardFlashBlastPhase?: number;
  glitchScanlineCount?: number;
  glitchBandWidth?: number;
  whipBlurLineCount?: number;
  whipBrightnessAlpha?: number;
  hardCutBumpAlpha?: number;
  // Kinetic text params
  captionPopStartScale?: number;
  captionPopExitScale?: number;
  captionSlideExitDistance?: number;
  captionFadeExitOffset?: number;
  captionFlickerSpeed?: number;
  captionPopIdleFreq?: number;
  captionFlickerIdleFreq?: number;
  captionBoldSizeMultiplier?: number;
  captionMinimalSizeMultiplier?: number;
  captionPopOvershoot?: number;
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
  globalTimelineOffset: number = 0,
  onFirstFrame?: (canvas: HTMLCanvasElement) => void,
  isLastClip: boolean = false
): Promise<void> {
  if (!instruction.mediaUrl) {
    console.warn(`Export: clip "${instruction.clip.id}" has no media URL — rendering placeholder to preserve tape timeline`);
    return renderPlaceholderClip(ctx, canvas, canvasDuration, onProgress, aiRenderOpts?.letterboxColor ?? "black");
  }
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    // Remote URLs (intro/outro cards) are pre-fetched as local blobs before reaching
    // here, so no crossOrigin attribute is needed. Cross-origin videos would taint the
    // canvas and cause captureStream() to produce blank frames.
    // However, if proxy pre-fetch failed and we fell back to the remote URL, set
    // crossOrigin so the browser attempts CORS — if CORS fails, onerror fires and
    // our placeholder fallback handles it instead of silently tainting the canvas.
    const isRemoteUrl = instruction.mediaUrl.startsWith("http");
    if (isRemoteUrl) {
      video.crossOrigin = "anonymous";
    }
    video.src = instruction.mediaUrl;
    video.preload = "auto";
    // Route original audio through the audio pipeline (not muted)
    const disconnectAudio = audioPipeline.connectVideo(video, instruction.clip.clipAudioVolume, instruction.clip.audioFadeIn, instruction.clip.audioFadeOut);

    // Safety timeout: if video never loads (bad codec, corrupt blob, etc.),
    // render a placeholder for the clip's duration to preserve tape timeline.
    const loadTimeout = setTimeout(() => {
      console.warn(`Export: video load timed out for clip "${instruction.clip.id}" after 15s — rendering placeholder to preserve tape timeline`);
      disconnectAudio();
      video.src = "";
      video.removeAttribute("src");
      renderPlaceholderClip(ctx, canvas, canvasDuration, onProgress, aiRenderOpts?.letterboxColor ?? "black").then(resolve);
    }, 15_000);

    video.onloadeddata = () => {
      clearTimeout(loadTimeout);
      const va = video.videoWidth / video.videoHeight;
      const ca = canvas.width / canvas.height;
      let baseW: number, baseH: number;
      const isCardClip = instruction.clip.id === "__intro__" || instruction.clip.id === "__outro__";
      if (isCardClip) {
        // Contain-fit for intro/outro cards: show full video without cropping,
        // matching preview behavior so text isn't cut off at export time.
        if (va > ca) { baseW = canvas.width; baseH = baseW / va; }
        else { baseH = canvas.height; baseW = baseH * va; }
      } else if (va > ca) { baseH = canvas.height; baseW = baseH * va; }
      else { baseW = canvas.width; baseH = baseW / va; }

      const { trimStart, trimEnd } = instruction.clip;
      const velocityPreset = instruction.clip.velocityPreset ?? "normal";

      const startPlayback = () => {
        video.play().catch((e) => {
          console.warn(`Export: video.play() rejected for clip "${instruction.clip.id}", will hold first frame:`, e);
        });

        const renderStartTime = performance.now();
        const canvasDurationMs = canvasDuration * 1000;
        let firstFrameCaptured = false;

        const drawFrame = () => {
          const canvasElapsedMs = performance.now() - renderStartTime;
          const canvasElapsedSec = canvasElapsedMs / 1000;
          const globalTime = globalTimelineOffset + canvasElapsedSec;

          // Only terminate when canvas duration has fully elapsed
          if (canvasElapsedMs >= canvasDurationMs) {
            video.pause();
            disconnectAudio();
            video.src = "";
            video.removeAttribute("src");
            video.load();
            resolve();
            return;
          }

          // Hold last frame if video ended naturally, play was blocked, or reached trim end
          if (video.ended || video.paused || video.currentTime >= trimEnd) {
            onProgress(Math.min(99, (canvasElapsedMs / canvasDurationMs) * 100));
            // Redraw the held video frame with correct layout + overlays
            ctx.fillStyle = aiRenderOpts?.letterboxColor ?? "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
            const dw = baseW;
            const dh = baseH;
            const dx = (canvas.width - dw) / 2;
            const dy = (canvas.height - dh) / 2;
            ctx.drawImage(video, dx, dy, dw, dh);
            ctx.filter = "none";
            drawOverlays(ctx, canvas, watermarkText, instruction.captionText, instruction.captionStyle, canvasElapsedSec, canvasDuration, buildCaptionCustom(instruction.clip), wmOpacity, captionEntrance, captionExit, aiRenderOpts, instruction.clip.captionAnimationIntensity ?? 1.0, instruction.clip.captionIdlePulse ?? 1.0, instruction.clip.customCaptionGlowSpread, instruction.clip.captionExitAnimation ?? aiRenderOpts?.captionExitAnimation ?? "fade");
            scheduleExportFrame(drawFrame);
            return;
          }

          onProgress(Math.min(99, (canvasElapsedMs / canvasDurationMs) * 100));

          // Apply velocity — custom keyframes take priority over presets
          // End-of-clip micro-deceleration stacks on top for natural exit feel
          const exitDecel = getExitDeceleration(canvasElapsedSec, canvasDuration, aiRenderOpts?.exitDecelSpeed ?? 0.96, aiRenderOpts?.exitDecelDuration ?? 0.14, aiRenderOpts?.exitDecelEasing ?? "quad");
          const customKf = instruction.clip.customVelocityKeyframes;
          if (customKf && customKf.length >= 2) {
            const posInClip = Math.min(1, canvasElapsedSec / canvasDuration);
            const speed = getSpeedFromKeyframes(posInClip, customKf) * exitDecel;
            const clampedSpeed = Math.max(0.05, Math.min(5, speed));
            if (Math.abs(video.playbackRate - clampedSpeed) > 0.05) {
              video.playbackRate = clampedSpeed;
            }
          } else if (velocityPreset !== "normal") {
            const posInClip = Math.min(1, canvasElapsedSec / canvasDuration);
            const speed = getSpeedAtPosition(posInClip, velocityPreset) * exitDecel;
            const clampedSpeed = Math.max(0.05, Math.min(5, speed));
            if (Math.abs(video.playbackRate - clampedSpeed) > 0.05) {
              video.playbackRate = clampedSpeed;
            }
          } else if (exitDecel < 1.0) {
            // Even "normal" speed clips get exit deceleration
            if (Math.abs(video.playbackRate - exitDecel) > 0.02) {
              video.playbackRate = exitDecel;
            }
          }

          const entryScale = getClipEntryScale(canvasElapsedSec, style.entryPunchScale, style.entryPunchDuration);

          // Ken Burns — slow zoom over clip duration (AI controls intensity)
          const kenBurnsScale = 1 + (canvasElapsedMs / canvasDurationMs) * (style.kenBurnsIntensity ?? 0);

          // Beat pulse — per-clip override → plan-level → default
          let beatPulse = 1;
          let currentBeatIntensity = 0;
          const clipBeatPulse = instruction.clip.beatPulseIntensity ?? aiRenderOpts?.beatPulseIntensity ?? 0.015;
          if (beatGrid) {
            currentBeatIntensity = getBeatIntensity(globalTime, beatGrid, beatTolerance);
            beatPulse = 1 + currentBeatIntensity * clipBeatPulse;
          }

          // Micro-settle: subtle scale+position ease on clip entry
          const settle = getMicroSettle(canvasElapsedSec, aiRenderOpts?.settleScale ?? 1.006, aiRenderOpts?.settleDuration ?? 0.18, aiRenderOpts?.settleEasing ?? "cubic");

          if (crossfadeFrom && transType && canvasElapsedSec < style.transitionDuration) {
            const progress = canvasElapsedSec / style.transitionDuration;
            const transIntensity = instruction.clip.transitionIntensity ?? 1.0;
            renderTransitionFrame(ctx, canvas, crossfadeFrom, transType, progress, transitionSeed, () => {
              const inTransform = scaleTransform(getTransitionTransform(transType, progress, false, canvas.width, instruction.clip.transitionParams), transIntensity);
              const totalScale = inTransform.scale * entryScale * beatPulse * kenBurnsScale * settle.scale;
              const dw = baseW * totalScale;
              const dh = baseH * totalScale;
              const dx = (canvas.width - dw) / 2 + inTransform.offsetX;
              const dy = (canvas.height - dh) / 2 + inTransform.offsetY + settle.offsetY;
              ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
              ctx.drawImage(video, dx, dy, dw, dh);
              ctx.filter = "none";
            }, neonColorHexes, aiRenderOpts, transIntensity);
          } else {
            const totalScale = entryScale * beatPulse * kenBurnsScale * settle.scale;
            const dw = baseW * totalScale;
            const dh = baseH * totalScale;
            const dx = (canvas.width - dw) / 2;
            const dy = (canvas.height - dh) / 2 + settle.offsetY;
            ctx.fillStyle = aiRenderOpts?.letterboxColor ?? "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
            ctx.drawImage(video, dx, dy, dw, dh);
            ctx.filter = "none";
          }

          // Warmth shift on final clip — subtle warm grade in last 2s
          if (isLastClip) {
            const warmCSS = getWarmthShiftCSS(canvasElapsedSec, canvasDuration, aiRenderOpts?.finalClipWarmth ?? true);
            if (warmCSS) {
              ctx.filter = warmCSS;
              ctx.drawImage(canvas, 0, 0);
              ctx.filter = "none";
            }
          }

          // Beat flash overlay — per-clip override → plan-level → default
          if (beatGrid) {
            const beatInt = currentBeatIntensity;
            const clipBeatFlash = instruction.clip.beatFlashOpacity ?? aiRenderOpts?.beatFlashOpacity ?? 0.12;
            const clipBeatThreshold = instruction.clip.beatFlashThreshold ?? aiRenderOpts?.beatFlashThreshold ?? 0.5;
            if (beatInt > clipBeatThreshold && clipBeatFlash > 0) {
              ctx.save();
              ctx.globalAlpha = (beatInt - clipBeatThreshold) * clipBeatFlash;
              ctx.fillStyle = instruction.clip.beatFlashColor ?? aiRenderOpts?.beatFlashColor ?? "white";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.restore();
            }
          }

          // Film stock base + grain + vignette — pro post-processing overlays
          applyFilmStock(ctx, canvas.width, canvas.height, aiRenderOpts?.filmStock);
          drawVignette(ctx, canvas.width, canvas.height, aiRenderOpts?.vignetteIntensity ?? 0.18, aiRenderOpts?.vignetteTightness ?? 0.45, aiRenderOpts?.vignetteHardness ?? 0.48);
          drawFilmGrain(ctx, canvas.width, canvas.height, aiRenderOpts?.grainOpacity ?? 0.045, aiRenderOpts?.grainBlockSize ?? 4);

          drawOverlays(ctx, canvas, watermarkText, instruction.captionText, instruction.captionStyle, canvasElapsedSec, canvasDuration, buildCaptionCustom(instruction.clip), wmOpacity, captionEntrance, captionExit, aiRenderOpts, instruction.clip.captionAnimationIntensity ?? 1.0, instruction.clip.captionIdlePulse ?? 1.0, instruction.clip.customCaptionGlowSpread, instruction.clip.captionExitAnimation ?? aiRenderOpts?.captionExitAnimation ?? "fade");

          // Capture first frame for seamless loop crossfade
          if (!firstFrameCaptured && onFirstFrame) {
            firstFrameCaptured = true;
            onFirstFrame(canvas);
          }

          scheduleExportFrame(drawFrame);
        };

        scheduleExportFrame(drawFrame);
      };

      // Seek to trimStart, then begin playback.
      // When trimStart is 0 (e.g. intro/outro cards), the video may already be
      // at position 0, so the 'seeked' event might not fire. Handle both cases.
      if (trimStart === 0) {
        // Already at position 0 — start immediately
        startPlayback();
      } else {
        video.onseeked = () => startPlayback();
        video.currentTime = trimStart;
      }
    };

    video.onerror = (e) => {
      clearTimeout(loadTimeout);
      const clipId = instruction.clip.id;
      const src = instruction.mediaUrl?.slice(0, 80);
      const mediaErr = video.error;
      console.error(`Export: video load failed for clip "${clipId}", src="${src}", code=${mediaErr?.code}, message="${mediaErr?.message}"`, e);
      disconnectAudio();
      video.src = "";
      video.removeAttribute("src");
      // Fall back to a placeholder instead of crashing the entire export.
      // This keeps the tape timeline intact (audio/transitions stay in sync)
      // and matches the graceful degradation that renderPhotoClip uses.
      console.warn(`Export: rendering placeholder for clip "${clipId}" to preserve tape timeline`);
      renderPlaceholderClip(ctx, canvas, canvasDuration, onProgress, aiRenderOpts?.letterboxColor ?? "black").then(resolve);
    };
  });
}

async function renderPhotoClip(
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
  globalTimelineOffset: number = 0,
  isLastClip: boolean = false
): Promise<void> {
  // Use createImageBitmap with the original File/Blob when available — avoids
  // blob URL loading issues entirely. Falls back to Image element + URL.
  const loadImage = async (): Promise<ImageBitmap | HTMLImageElement> => {
    if (instruction.mediaFile) {
      console.log(`Export: loading photo clip "${instruction.clip.id}" via createImageBitmap (${instruction.mediaFile.size} bytes, type=${instruction.mediaFile.type})`);
      try {
        return await createImageBitmap(instruction.mediaFile);
      } catch (bmpErr) {
        console.warn(`Export: createImageBitmap failed for clip "${instruction.clip.id}", falling back to Image element`, bmpErr);
      }
    }

    // Fallback: load via Image element + URL
    return new Promise<HTMLImageElement>((res, rej) => {
      if (!instruction.mediaUrl) {
        rej(new Error(`No media URL for clip "${instruction.clip.id}"`));
        return;
      }
      const img = new window.Image();
      img.onload = () => res(img);
      img.onerror = (e) => {
        const src = instruction.mediaUrl?.slice(0, 80);
        console.error(`Export: image load failed for clip "${instruction.clip.id}", src="${src}"`, e);
        img.src = "";
        rej(new Error(`Failed to load image for clip "${instruction.clip.id}" — src: ${src}`));
      };
      img.src = instruction.mediaUrl;
    });
  };

  let imgSource: ImageBitmap | HTMLImageElement;
  try {
    imgSource = await loadImage();
  } catch (err) {
    console.warn(`Export: photo clip "${instruction.clip.id}" load failed — rendering placeholder to preserve tape timeline`, err);
    return renderPlaceholderClip(ctx, canvas, canvasDuration, onProgress, aiRenderOpts?.letterboxColor ?? "black");
  }

  return new Promise((resolve) => {
    const ia = imgSource.width / imgSource.height;
    const ca = canvas.width / canvas.height;
    let baseW: number, baseH: number;
    const isCardClip = instruction.clip.id === "__intro__" || instruction.clip.id === "__outro__";
    if (isCardClip) {
      if (ia > ca) { baseW = canvas.width; baseH = baseW / ia; }
      else { baseH = canvas.height; baseW = baseH * ia; }
    } else if (ia > ca) { baseH = canvas.height; baseW = baseH * ia; }
    else { baseW = canvas.width; baseH = baseW / ia; }

    const durationMs = (canvasDuration > 0 ? canvasDuration : photoDisplayDur) * 1000;
    const transitionMs = style.transitionDuration * 1000;
    const startTime = performance.now();

    const drawFrame = () => {
      const elapsedMs = performance.now() - startTime;
      if (elapsedMs >= durationMs) {
        onProgress(100);
        if (imgSource instanceof ImageBitmap) imgSource.close();
        resolve();
        return;
      }

      const elapsedSec = elapsedMs / 1000;
      const globalTime = globalTimelineOffset + elapsedSec;
      onProgress((elapsedMs / durationMs) * 100);

      const kenBurnsScale = 1 + (elapsedMs / durationMs) * style.kenBurnsIntensity;
      const entryScale = getClipEntryScale(elapsedSec, style.entryPunchScale, style.entryPunchDuration);

      // Beat pulse — per-clip override → plan-level → default
      let beatPulse = 1;
      let currentBeatIntensity = 0;
      const clipBeatPulsePhoto = instruction.clip.beatPulseIntensity ?? aiRenderOpts?.beatPulseIntensity ?? 0.015;
      if (beatGrid) {
        currentBeatIntensity = getBeatIntensity(globalTime, beatGrid, beatTolerance);
        beatPulse = 1 + currentBeatIntensity * clipBeatPulsePhoto;
      }

      // Micro-settle: subtle scale+position ease on clip entry
      const settle = getMicroSettle(elapsedSec, aiRenderOpts?.settleScale ?? 1.006, aiRenderOpts?.settleDuration ?? 0.18, aiRenderOpts?.settleEasing ?? "cubic");

      if (crossfadeFrom && transType && elapsedMs < transitionMs) {
        const progress = elapsedMs / transitionMs;
        const transIntensity = instruction.clip.transitionIntensity ?? 1.0;
        renderTransitionFrame(ctx, canvas, crossfadeFrom, transType, progress, transitionSeed, () => {
          const inTransform = scaleTransform(getTransitionTransform(transType, progress, false, canvas.width, instruction.clip.transitionParams), transIntensity);
          const totalScale = kenBurnsScale * entryScale * inTransform.scale * beatPulse * settle.scale;
          const dw = baseW * totalScale;
          const dh = baseH * totalScale;
          const dx = (canvas.width - dw) / 2 + inTransform.offsetX;
          const dy = (canvas.height - dh) / 2 + inTransform.offsetY + settle.offsetY;
          ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
          ctx.drawImage(imgSource, dx, dy, dw, dh);
          ctx.filter = "none";
        }, neonColorHexes, aiRenderOpts, transIntensity);
      } else {
        const totalScale = kenBurnsScale * entryScale * beatPulse * settle.scale;
        const dw = baseW * totalScale;
        const dh = baseH * totalScale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2 + settle.offsetY;
        ctx.fillStyle = aiRenderOpts?.letterboxColor ?? "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
        ctx.drawImage(imgSource, dx, dy, dw, dh);
        ctx.filter = "none";
      }

      // Warmth shift on final clip
      if (isLastClip) {
        const warmCSS = getWarmthShiftCSS(elapsedSec, canvasDuration || photoDisplayDur, aiRenderOpts?.finalClipWarmth ?? true);
        if (warmCSS) {
          ctx.filter = warmCSS;
          ctx.drawImage(canvas, 0, 0);
          ctx.filter = "none";
        }
      }

      // Beat flash overlay — per-clip override → plan-level → default
      if (beatGrid) {
        const clipBeatFlashPhoto = instruction.clip.beatFlashOpacity ?? aiRenderOpts?.beatFlashOpacity ?? 0.12;
        const clipBeatThresholdPhoto = instruction.clip.beatFlashThreshold ?? aiRenderOpts?.beatFlashThreshold ?? 0.5;
        if (currentBeatIntensity > clipBeatThresholdPhoto && clipBeatFlashPhoto > 0) {
          ctx.save();
          ctx.globalAlpha = (currentBeatIntensity - clipBeatThresholdPhoto) * clipBeatFlashPhoto;
          ctx.fillStyle = instruction.clip.beatFlashColor ?? aiRenderOpts?.beatFlashColor ?? "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
      }

      // Film stock base + grain + vignette — pro post-processing overlays
      applyFilmStock(ctx, canvas.width, canvas.height, aiRenderOpts?.filmStock);
      drawVignette(ctx, canvas.width, canvas.height, aiRenderOpts?.vignetteIntensity ?? 0.18, aiRenderOpts?.vignetteTightness ?? 0.45, aiRenderOpts?.vignetteHardness ?? 0.48);
      drawFilmGrain(ctx, canvas.width, canvas.height, aiRenderOpts?.grainOpacity ?? 0.045, aiRenderOpts?.grainBlockSize ?? 4);

      drawOverlays(ctx, canvas, watermarkText, instruction.captionText, instruction.captionStyle, elapsedSec, canvasDuration || photoDisplayDur, buildCaptionCustom(instruction.clip), wmOpacity, captionEntrance, captionExit, aiRenderOpts, instruction.clip.captionAnimationIntensity ?? 1.0, instruction.clip.captionIdlePulse ?? 1.0, instruction.clip.customCaptionGlowSpread, instruction.clip.captionExitAnimation ?? aiRenderOpts?.captionExitAnimation ?? "fade");
      scheduleExportFrame(drawFrame);
    };

    scheduleExportFrame(drawFrame);
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
  aiRenderOpts?: ExportAiRenderOptions,
  transitionIntensity: number = 1.0
) {
  const outAlpha = getClipAlpha(transType, progress, true);
  const inAlpha = getClipAlpha(transType, progress, false);
  const rawOutTransform = getTransitionTransform(transType, progress, true, canvas.width, undefined);
  const outTransform = scaleTransform(rawOutTransform, transitionIntensity);

  ctx.fillStyle = aiRenderOpts?.letterboxColor ?? "black";
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
  drawTransitionOverlay(ctx, canvas.width, canvas.height, transType, progress, seed, neonColorHexes, aiRenderOpts, transitionIntensity);
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
  aiRenderOpts?: ExportAiRenderOptions,
  captionAnimationIntensity: number = 1.0,
  captionIdlePulse: number = 1.0,
  captionGlowSpread?: number,
  captionExitAnimation: string = "fade"
) {
  if (watermarkText) {
    ctx.save();
    ctx.globalAlpha = wmOpacity;
    const wmFontPx = Math.round(canvas.height * (aiRenderOpts?.watermarkFontSize ?? 0.015));
    const wmYOff = Math.round(canvas.height * (aiRenderOpts?.watermarkYOffset ?? 0.03));
    ctx.font = `bold ${wmFontPx}px -apple-system, sans-serif`;
    ctx.fillStyle = aiRenderOpts?.watermarkColor ?? "white";
    ctx.textAlign = "center";
    ctx.fillText(watermarkText, canvas.width / 2, canvas.height - wmYOff);
    ctx.restore();
  }

  // Kinetic text instead of static caption
  // Caption appear delay: AI-controlled, let the visual land first before showing text
  const captionDelay = aiRenderOpts?.captionAppearDelay ?? 0.12;
  if (captionText && localTime >= captionDelay) {
    const adjustedTime = localTime - captionDelay;
    const adjustedDuration = clipDuration - captionDelay;
    const kineticParams = aiRenderOpts ? {
      popStartScale: aiRenderOpts.captionPopStartScale,
      popExitScale: aiRenderOpts.captionPopExitScale,
      slideExitDistance: aiRenderOpts.captionSlideExitDistance,
      fadeExitOffset: aiRenderOpts.captionFadeExitOffset,
      flickerSpeed: aiRenderOpts.captionFlickerSpeed,
      popIdleFreq: aiRenderOpts.captionPopIdleFreq,
      flickerIdleFreq: aiRenderOpts.captionFlickerIdleFreq,
      boldSizeMultiplier: aiRenderOpts.captionBoldSizeMultiplier,
      minimalSizeMultiplier: aiRenderOpts.captionMinimalSizeMultiplier,
      popOvershoot: aiRenderOpts.captionPopOvershoot,
    } : undefined;
    const kTransform = getKineticTransform(captionStyle, adjustedTime, adjustedDuration, canvas.height, captionCustom, captionEntrance, captionExit, captionAnimationIntensity, captionIdlePulse, captionExitAnimation, kineticParams);
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
      aiRenderOpts?.captionShadowBlur,
      captionGlowSpread,
      kineticParams
    );
  }
}
