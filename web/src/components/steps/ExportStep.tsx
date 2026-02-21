"use client";

import { useState, useRef, useCallback } from "react";
import { ArrowLeft, Download, Share2, RotateCcw, Check, Crown, Film } from "lucide-react";
import { useApp, canExportFree, getMediaFile } from "@/lib/store";
import { VIDEO_FILTERS } from "@/lib/filters";
import { WATERMARK_TEXT, WATERMARK_OPACITY, FREE_EXPORT_LIMIT, IOS_APP_STORE_URL, PHOTO_DISPLAY_DURATION } from "@/lib/constants";
import { haptic } from "@/lib/utils";
import Confetti from "@/components/Confetti";
import type { EditedClip } from "@/lib/types";

type ExportPhase = "preview" | "rendering" | "done" | "limit-hit";

export default function ExportStep() {
  const { state, dispatch } = useApp();
  const [phase, setPhase] = useState<ExportPhase>("preview");
  const [progress, setProgress] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sortedClips = [...state.clips].sort((a, b) => a.order - b.order);
  const totalDuration = sortedClips.reduce((sum, c) => sum + (c.trimEnd - c.trimStart), 0);

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
      // Build clip render instructions
      const renderClips: RenderClipInstruction[] = sortedClips.map((clip) => {
        const media = getMediaFile(state, clip.sourceFileId);
        return {
          clip,
          mediaUrl: media?.url ?? "",
          mediaType: media?.type ?? "video",
          filterCSS: VIDEO_FILTERS[clip.selectedFilter],
          captionText: clip.captionText,
        };
      });

      const blob = await renderHighlightTape(
        renderClips,
        isFree ? WATERMARK_TEXT : null,
        (pct) => setProgress(pct)
      );

      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      dispatch({ type: "INCREMENT_EXPORTS" });
      setPhase("done");
      haptic([10, 50, 10]);
    } catch (err) {
      console.error("Export failed:", err);
      setPhase("preview");
    }
  }, [canExport, sortedClips, state, isFree, dispatch]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `highlight-tape-${Date.now()}.webm`;
    a.click();
    haptic();
  };

  const handleShare = async () => {
    if (!blobUrl) return;
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const file = new File([blob], "highlight-tape.webm", { type: "video/webm" });
      if (navigator.share) {
        await navigator.share({ files: [file], title: "Made with Highlight Magic" });
      } else {
        handleDownload();
      }
    } catch {
      handleDownload();
    }
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
              <Row label="Total Duration" value={`~${Math.round(totalDuration)}s`} />
              <Row label="Format" value="WebM · 1080×1920" />
              {isFree && <Row label="Watermark" value="Included (Free tier)" />}
              {isFree && (
                <Row
                  label="Exports remaining"
                  value={`${FREE_EXPORT_LIMIT - state.exportsUsed}/${FREE_EXPORT_LIMIT}`}
                />
              )}
            </div>

            {/* Tape sequence preview */}
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
            Rendering {sortedClips.length} clips into one highlight tape...
          </p>
        </div>
      )}

      {/* Done phase */}
      {phase === "done" && (
        <div className="flex flex-col items-center gap-6 py-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--success)]">
            <Check className="h-10 w-10 text-white" />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-bold text-white">Highlight Tape Ready!</h3>
            <p className="mt-1 text-[var(--text-secondary)]">
              {sortedClips.length} clips combined into one video — ready to share
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
              onClick={() => {
                dispatch({ type: "RESET" });
              }}
              className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--text-tertiary)] hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
              Start Over
            </button>
          </div>

          <p className="text-xs text-[var(--text-tertiary)]">Made with Highlight Magic</p>

          {/* iOS upsell */}
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

      {/* Hidden canvas for rendering */}
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

// ── Multi-clip rendering ──

interface RenderClipInstruction {
  clip: EditedClip;
  mediaUrl: string;
  mediaType: "video" | "photo";
  filterCSS: string;
  captionText: string;
}

/**
 * Render all clips sequentially into one combined WebM video.
 * Plays each clip segment in order on a canvas, records with MediaRecorder.
 */
async function renderHighlightTape(
  clips: RenderClipInstruction[],
  watermarkText: string | null,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d")!;

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const totalDuration = clips.reduce((sum, c) => sum + (c.clip.trimEnd - c.clip.trimStart), 0);
  let elapsedTotal = 0;

  recorder.start();

  for (const instruction of clips) {
    const clipDuration = instruction.clip.trimEnd - instruction.clip.trimStart;

    if (instruction.mediaType === "photo") {
      await renderPhotoClip(
        ctx,
        canvas,
        instruction,
        watermarkText,
        (pct) => {
          onProgress(Math.min(99, ((elapsedTotal + (pct / 100) * clipDuration) / totalDuration) * 100));
        }
      );
    } else {
      await renderVideoClip(
        ctx,
        canvas,
        instruction,
        watermarkText,
        (pct) => {
          onProgress(Math.min(99, ((elapsedTotal + (pct / 100) * clipDuration) / totalDuration) * 100));
        }
      );
    }

    elapsedTotal += clipDuration;
  }

  recorder.stop();

  return new Promise((resolve) => {
    recorder.onstop = () => {
      onProgress(100);
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
  });
}

function renderVideoClip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  instruction: RenderClipInstruction,
  watermarkText: string | null,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.src = instruction.mediaUrl;
    video.preload = "auto";

    video.onloadeddata = () => {
      const videoAspect = video.videoWidth / video.videoHeight;
      const canvasAspect = canvas.width / canvas.height;
      let drawW: number, drawH: number, drawX: number, drawY: number;

      if (videoAspect > canvasAspect) {
        drawH = canvas.height;
        drawW = drawH * videoAspect;
        drawX = (canvas.width - drawW) / 2;
        drawY = 0;
      } else {
        drawW = canvas.width;
        drawH = drawW / videoAspect;
        drawX = 0;
        drawY = (canvas.height - drawH) / 2;
      }

      const { trimStart, trimEnd } = instruction.clip;
      const duration = trimEnd - trimStart;
      video.currentTime = trimStart;

      video.onseeked = () => {
        video.play();

        const drawFrame = () => {
          if (video.currentTime >= trimEnd || video.paused) {
            video.pause();
            resolve();
            return;
          }

          const elapsed = video.currentTime - trimStart;
          onProgress(Math.min(99, (elapsed / duration) * 100));

          ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
          ctx.drawImage(video, drawX, drawY, drawW, drawH);
          ctx.filter = "none";

          drawOverlays(ctx, canvas, watermarkText, instruction.captionText);

          requestAnimationFrame(drawFrame);
        };

        requestAnimationFrame(drawFrame);
      };
    };

    video.onerror = () => reject(new Error("Failed to load video for rendering"));
  });
}

function renderPhotoClip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  instruction: RenderClipInstruction,
  watermarkText: string | null,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const imgAspect = img.width / img.height;
      const canvasAspect = canvas.width / canvas.height;
      let drawW: number, drawH: number, drawX: number, drawY: number;

      if (imgAspect > canvasAspect) {
        drawH = canvas.height;
        drawW = drawH * imgAspect;
        drawX = (canvas.width - drawW) / 2;
        drawY = 0;
      } else {
        drawW = canvas.width;
        drawH = drawW / imgAspect;
        drawX = 0;
        drawY = (canvas.height - drawH) / 2;
      }

      const durationMs = PHOTO_DISPLAY_DURATION * 1000;
      const startTime = performance.now();

      const drawFrame = () => {
        const elapsed = performance.now() - startTime;

        if (elapsed >= durationMs) {
          onProgress(100);
          resolve();
          return;
        }

        onProgress((elapsed / durationMs) * 100);

        // Subtle Ken Burns zoom effect
        const zoomProgress = elapsed / durationMs;
        const scale = 1 + zoomProgress * 0.05;
        const scaledW = drawW * scale;
        const scaledH = drawH * scale;
        const scaledX = drawX - (scaledW - drawW) / 2;
        const scaledY = drawY - (scaledH - drawH) / 2;

        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.filter = instruction.filterCSS === "none" ? "none" : instruction.filterCSS;
        ctx.drawImage(img, scaledX, scaledY, scaledW, scaledH);
        ctx.filter = "none";

        drawOverlays(ctx, canvas, watermarkText, instruction.captionText);

        requestAnimationFrame(drawFrame);
      };

      requestAnimationFrame(drawFrame);
    };

    img.onerror = () => reject(new Error("Failed to load image for rendering"));
    img.src = instruction.mediaUrl;
  });
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  watermarkText: string | null,
  captionText: string
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

  if (captionText) {
    ctx.save();
    ctx.font = "bold 48px -apple-system, sans-serif";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 8;
    ctx.fillText(captionText, canvas.width / 2, canvas.height - 200);
    ctx.restore();
  }
}
