"use client";

import { useState, useRef, useCallback } from "react";
import { ArrowLeft, Download, Share2, RotateCcw, Crown, Film, Repeat, Music } from "lucide-react";
import { useApp, canExportFree, getMediaFile } from "@/lib/store";
import { VIDEO_FILTERS } from "@/lib/filters";
import {
  WATERMARK_TEXT,
  WATERMARK_OPACITY,
  FREE_EXPORT_LIMIT,
  IOS_APP_STORE_URL,
  PHOTO_DISPLAY_DURATION,
  EXPORT_BITRATE,
  LOOP_CROSSFADE_DURATION,
} from "@/lib/constants";
import { getEditingStyle, getThemeTransitions } from "@/lib/editing-styles";
import {
  getClipAlpha,
  getTransitionTransform,
  drawTransitionOverlay,
  getClipEntryScale,
  type TransitionType,
} from "@/lib/transitions";
import { buildBeatGrid, getBeatIntensity, type BeatGrid } from "@/lib/beat-sync";
import { getSpeedAtPosition } from "@/lib/velocity";
import { getKineticTransform, drawKineticCaption } from "@/lib/kinetic-text";
import { createAudioPipeline, type AudioPipeline } from "@/lib/audio-mux";
import { haptic } from "@/lib/utils";
import Confetti from "@/components/Confetti";
import type { EditedClip, EditingTheme, CaptionStyle, ViralExportOptions } from "@/lib/types";

type ExportPhase = "preview" | "rendering" | "done" | "limit-hit" | "error";

/** Try codecs in preference order. */
function pickMimeType(): { mimeType: string; ext: string } {
  const candidates = [
    { mimeType: "video/mp4;codecs=h264", ext: "mp4" },
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sortedClips = [...state.clips].sort((a, b) => a.order - b.order);
  const totalDuration = sortedClips.reduce((sum, c) => sum + (c.trimEnd - c.trimStart), 0);
  const style = getEditingStyle(state.detectedTheme);
  const hasMusic = sortedClips.some((c) => c.selectedMusicTrack);

  const isFree = !state.isProUser;
  const canExport = state.isProUser || canExportFree(state);

  const handleExport = useCallback(async () => {
    if (!canExport) {
      setPhase("limit-hit");
      return;
    }

    setPhase("rendering");
    setProgress(0);
    haptic();

    try {
      const renderClips: RenderClipInstruction[] = sortedClips.map((clip) => {
        const media = getMediaFile(state, clip.sourceFileId);
        return {
          clip,
          mediaUrl: media?.url ?? "",
          mediaType: media?.type ?? "video",
          filterCSS: VIDEO_FILTERS[clip.selectedFilter],
          captionText: clip.captionText,
          captionStyle: clip.captionStyle,
        };
      });

      const { mimeType, ext } = pickMimeType();
      setExportExt(ext);

      const blob = await renderHighlightTape(
        renderClips,
        isFree ? WATERMARK_TEXT : null,
        state.detectedTheme,
        state.viralOptions,
        mimeType,
        (pct) => setProgress(pct)
      );

      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      dispatch({ type: "INCREMENT_EXPORTS" });
      setPhase("done");
      haptic([10, 50, 10]);
    } catch (err) {
      console.error("Export failed:", err);
      setPhase("error");
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
    } catch {
      handleDownload();
    }
  };

  const toggleViralOption = (key: keyof ViralExportOptions) => {
    dispatch({ type: "SET_VIRAL_OPTIONS", options: { [key]: !state.viralOptions[key] } });
  };

  const { mimeType: detectedMime } = typeof MediaRecorder !== "undefined" ? pickMimeType() : { mimeType: "video/webm" };
  const formatLabel = detectedMime.includes("mp4") ? "MP4 · H.264" : "WebM · VP9";

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
              <Row label="Total Duration" value={`~${Math.round(totalDuration)}s`} />
              <Row label="Editing Style" value={`${style.label} — ${style.description.split("—")[0].trim()}`} />
              <Row label="Format" value={`${formatLabel} · 1080×1920`} />
              {isFree && <Row label="Watermark" value="Included (Free tier)" />}
              {isFree && (
                <Row
                  label="Exports remaining"
                  value={`${FREE_EXPORT_LIMIT - state.exportsUsed}/${FREE_EXPORT_LIMIT}`}
                />
              )}
            </div>

            <div className="mt-4 flex gap-1 overflow-x-auto">
              {sortedClips.map((clip, i) => {
                const m = getMediaFile(state, clip.sourceFileId);
                return (
                  <div
                    key={clip.id}
                    className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[10px] text-[var(--text-secondary)]"
                  >
                    <Film className="h-3 w-3" />
                    {i + 1}. {Math.round(clip.trimEnd - clip.trimStart)}s
                    {m && <span className="max-w-[60px] truncate text-[var(--text-tertiary)]">{m.name}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Viral options */}
          <div className="glass-card w-full p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Viral Optimization
            </p>
            <div className="flex flex-col gap-2.5">
              <label className="flex cursor-pointer items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Music className="h-4 w-4 text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Beat Sync</p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      Snap cuts to the music&apos;s beat grid
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
                    <p className="text-sm font-medium text-white">Seamless Loop</p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      Cross-fade end into start for TikTok replay
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
      {phase === "rendering" && (
        <div className="flex w-full flex-col items-center gap-4 py-12">
          <div className="w-full max-w-xs">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-accent-gradient transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <p className="text-lg font-semibold text-white">{Math.round(progress)}%</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Rendering with {style.label.toLowerCase()} editing style...
          </p>
          <div className="flex gap-2 text-[10px] text-[var(--text-tertiary)]">
            {state.viralOptions.beatSync && hasMusic && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-400">Beat Sync</span>}
            {state.viralOptions.seamlessLoop && <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-blue-400">Loop</span>}
          </div>
        </div>
      )}

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
                autoPlay
                loop
                muted
              />
            </div>
          )}

          <div className="text-center">
            <h3 className="text-xl font-bold text-white">Highlight Tape Ready!</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {sortedClips.length} clips · {style.label} style — ready to share
            </p>
          </div>

          <div className="flex w-full flex-col gap-3">
            <button onClick={handleDownload} className="btn-primary flex items-center justify-center gap-2">
              <Download className="h-5 w-5" />
              Download
            </button>
            <button onClick={handleShare} className="btn-secondary flex items-center justify-center gap-2">
              <Share2 className="h-5 w-5" />
              Share
            </button>
            <button
              onClick={() => dispatch({ type: "RESET" })}
              className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--text-tertiary)] hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
              Start Over
            </button>
          </div>

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
  onProgress: (pct: number) => void
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d")!;

  const style = getEditingStyle(theme);
  // Fallback transitions from theme — used only when AI didn't specify per-clip
  const themeTransitions = getThemeTransitions(theme, Math.max(0, clips.length - 1));

  // Beat grid for beat-sync
  let beatGrid: BeatGrid | null = null;
  if (viralOptions.beatSync) {
    const track = clips.find((c) => c.clip.selectedMusicTrack)?.clip.selectedMusicTrack;
    if (track) beatGrid = buildBeatGrid(track.bpm, 300);
  }

  // Audio pipeline: captures original clip audio + optional background music
  const canvasStream = canvas.captureStream(30);
  const musicTrack = clips.find((c) => c.clip.selectedMusicTrack)?.clip.selectedMusicTrack ?? null;
  const audioPipeline = await createAudioPipeline(canvasStream, musicTrack);
  const totalDuration = clips.reduce((sum, c) => sum + (c.clip.trimEnd - c.clip.trimStart), 0);

  const recorder = new MediaRecorder(audioPipeline.stream, {
    mimeType,
    videoBitsPerSecond: EXPORT_BITRATE,
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
      ? ((instruction.clip.transitionType as TransitionType) ?? themeTransitions[i - 1])
      : null;
    const crossfadeFrom = i > 0 ? crossfadeCanvas : null;

    // Per-clip style overrides: merge AI decisions with theme defaults
    const clipStyle = {
      ...style,
      transitionDuration: instruction.clip.transitionDuration ?? style.transitionDuration,
      entryPunchScale: instruction.clip.entryPunchScale ?? style.entryPunchScale,
      kenBurnsIntensity: instruction.clip.kenBurnsIntensity ?? style.kenBurnsIntensity,
    };

    if (instruction.mediaType === "photo") {
      await renderPhotoClip(ctx, canvas, instruction, watermarkText, clipStyle, transType, crossfadeFrom, i - 1, beatGrid, clipDuration, (pct) => {
        onProgress(Math.min(99, ((elapsedTotal + (pct / 100) * clipDuration) / totalDuration) * 100));
      });
    } else {
      await renderVideoClip(ctx, canvas, instruction, watermarkText, clipStyle, transType, crossfadeFrom, i - 1, beatGrid, clipDuration, audioPipeline, (pct) => {
        onProgress(Math.min(99, ((elapsedTotal + (pct / 100) * clipDuration) / totalDuration) * 100));
      });
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
  }

  // Seamless loop: cross-fade last frame into first frame
  if (viralOptions.seamlessLoop && firstFrameCanvas) {
    await renderLoopCrossfade(ctx, canvas, firstFrameCanvas, LOOP_CROSSFADE_DURATION);
  }

  recorder.stop();

  return new Promise((resolve) => {
    recorder.onstop = () => {
      audioPipeline.cleanup();
      onProgress(100);
      const blobType = mimeType.includes("mp4") ? "video/mp4" : "video/webm";
      resolve(new Blob(chunks, { type: blobType }));
    };
  });
}

/**
 * Render the seamless loop crossfade at the end of the tape.
 * Blends the current canvas (last frame) with the first frame over LOOP_CROSSFADE_DURATION.
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

    const durationMs = durationSec * 1000;
    const startTime = performance.now();

    const drawFrame = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= durationMs) {
        resolve();
        return;
      }

      const progress = elapsed / durationMs;

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

      requestAnimationFrame(drawFrame);
    };

    requestAnimationFrame(drawFrame);
  });
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
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
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
      if (va > ca) { baseH = canvas.height; baseW = baseH * va; }
      else { baseW = canvas.width; baseH = baseW / va; }

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

          if (canvasElapsedMs >= canvasDurationMs || video.paused) {
            video.pause();
            disconnectAudio();
            resolve();
            return;
          }

          // Stop if video reached trim end
          if (video.currentTime >= trimEnd) {
            // Hold last frame for remaining canvas time
            if (canvasElapsedMs < canvasDurationMs) {
              requestAnimationFrame(drawFrame);
              return;
            }
            video.pause();
            disconnectAudio();
            resolve();
            return;
          }

          onProgress(Math.min(99, (canvasElapsedMs / canvasDurationMs) * 100));

          // Apply velocity
          if (velocityPreset !== "normal") {
            const posInClip = Math.min(1, canvasElapsedSec / canvasDuration);
            const speed = getSpeedAtPosition(posInClip, velocityPreset);
            const clampedSpeed = Math.max(0.1, Math.min(4, speed));
            if (Math.abs(video.playbackRate - clampedSpeed) > 0.05) {
              video.playbackRate = clampedSpeed;
            }
          }

          const entryScale = getClipEntryScale(canvasElapsedSec, style.entryPunchScale, style.entryPunchDuration);

          // Beat pulse
          let beatPulse = 1;
          if (beatGrid) {
            const intensity = getBeatIntensity(canvasElapsedSec, beatGrid);
            beatPulse = 1 + intensity * 0.012;
          }

          if (crossfadeFrom && transType && canvasElapsedSec < style.transitionDuration) {
            const progress = canvasElapsedSec / style.transitionDuration;
            renderTransitionFrame(ctx, canvas, crossfadeFrom, transType, progress, transitionSeed, () => {
              const inTransform = getTransitionTransform(transType, progress, false, canvas.width);
              const totalScale = inTransform.scale * entryScale * beatPulse;
              const dw = baseW * totalScale;
              const dh = baseH * totalScale;
              const dx = (canvas.width - dw) / 2 + inTransform.offsetX;
              const dy = (canvas.height - dh) / 2 + inTransform.offsetY;
              ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
              ctx.drawImage(video, dx, dy, dw, dh);
              ctx.filter = "none";
            });
          } else {
            const totalScale = entryScale * beatPulse;
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

          drawOverlays(ctx, canvas, watermarkText, instruction.captionText, instruction.captionStyle, canvasElapsedSec, canvasDuration);
          requestAnimationFrame(drawFrame);
        };

        requestAnimationFrame(drawFrame);
      };
    };

    video.onerror = () => {
      disconnectAudio();
      reject(new Error("Failed to load video for rendering"));
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
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const ia = img.width / img.height;
      const ca = canvas.width / canvas.height;
      let baseW: number, baseH: number;
      if (ia > ca) { baseH = canvas.height; baseW = baseH * ia; }
      else { baseW = canvas.width; baseH = baseW / ia; }

      const durationMs = (canvasDuration > 0 ? canvasDuration : PHOTO_DISPLAY_DURATION) * 1000;
      const transitionMs = style.transitionDuration * 1000;
      const startTime = performance.now();

      const drawFrame = () => {
        const elapsedMs = performance.now() - startTime;
        if (elapsedMs >= durationMs) { onProgress(100); resolve(); return; }

        const elapsedSec = elapsedMs / 1000;
        onProgress((elapsedMs / durationMs) * 100);

        const kenBurnsScale = 1 + (elapsedMs / durationMs) * style.kenBurnsIntensity;
        const entryScale = getClipEntryScale(elapsedSec, style.entryPunchScale, style.entryPunchDuration);

        // Beat pulse
        let beatPulse = 1;
        if (beatGrid) {
          const intensity = getBeatIntensity(elapsedSec, beatGrid);
          beatPulse = 1 + intensity * 0.012;
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
          });
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

        drawOverlays(ctx, canvas, watermarkText, instruction.captionText, instruction.captionStyle, elapsedSec, canvasDuration || PHOTO_DISPLAY_DURATION);
        requestAnimationFrame(drawFrame);
      };

      requestAnimationFrame(drawFrame);
    };

    img.onerror = () => reject(new Error("Failed to load image for rendering"));
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
  drawIncoming: () => void
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
  drawTransitionOverlay(ctx, canvas.width, canvas.height, transType, progress, seed);
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  watermarkText: string | null,
  captionText: string,
  captionStyle: CaptionStyle,
  localTime: number,
  clipDuration: number
) {
  if (watermarkText) {
    ctx.save();
    ctx.globalAlpha = WATERMARK_OPACITY;
    ctx.font = "bold 28px -apple-system, sans-serif";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(watermarkText, canvas.width / 2, canvas.height - 60);
    ctx.restore();
  }

  // Kinetic text instead of static caption
  if (captionText) {
    const kTransform = getKineticTransform(captionStyle, localTime, clipDuration, canvas.height);
    drawKineticCaption(
      ctx,
      captionText,
      captionStyle,
      kTransform,
      canvas.width,
      canvas.height,
      48
    );
  }
}
