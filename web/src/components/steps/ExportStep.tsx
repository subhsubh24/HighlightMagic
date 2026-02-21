"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Download, Share2, RotateCcw, Check, Crown } from "lucide-react";
import { useApp, canExportFree } from "@/lib/store";
import { VIDEO_FILTERS } from "@/lib/filters";
import { WATERMARK_TEXT, WATERMARK_OPACITY, FREE_EXPORT_LIMIT, IOS_APP_STORE_URL } from "@/lib/constants";
import { formatTime, haptic } from "@/lib/utils";
import Confetti from "@/components/Confetti";

type ExportPhase = "preview" | "rendering" | "done" | "limit-hit";

export default function ExportStep() {
  const { state, dispatch } = useApp();
  const [phase, setPhase] = useState<ExportPhase>("preview");
  const [progress, setProgress] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const clip = state.clips.find((c) => c.id === state.activeClipId);
  if (!clip) return null;

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
      const blob = await renderClipToBlob(
        state.videoUrl!,
        clip.trimStart,
        clip.trimEnd,
        VIDEO_FILTERS[clip.selectedFilter],
        isFree ? WATERMARK_TEXT : null,
        clip.captionText,
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
  }, [canExport, state.videoUrl, state.isProUser, clip, isFree, dispatch]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `highlight-magic-${Date.now()}.webm`;
    a.click();
    haptic();
  };

  const handleShare = async () => {
    if (!blobUrl) return;
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const file = new File([blob], "highlight.webm", { type: "video/webm" });
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
        <h2 className="font-semibold text-white">Export</h2>
        <div className="w-9" />
      </div>

      {/* Preview phase */}
      {phase === "preview" && (
        <>
          <div className="glass-card w-full p-4">
            <div className="flex flex-col gap-2 text-sm">
              <Row label="Duration" value={`${Math.round(clip.trimEnd - clip.trimStart)}s`} />
              <Row label="Format" value="WebM · 1080×1920" />
              <Row label="Filter" value={clip.selectedFilter} />
              {clip.selectedMusicTrack && <Row label="Music" value={clip.selectedMusicTrack.name} />}
              {isFree && <Row label="Watermark" value="Included (Free tier)" />}
              {isFree && (
                <Row
                  label="Exports remaining"
                  value={`${FREE_EXPORT_LIMIT - state.exportsUsed}/${FREE_EXPORT_LIMIT}`}
                />
              )}
            </div>
          </div>
          <button onClick={handleExport} className="btn-primary flex w-full items-center justify-center gap-2">
            <Download className="h-5 w-5" />
            Export Now
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
          <p className="text-sm text-[var(--text-secondary)]">Rendering your highlight...</p>
        </div>
      )}

      {/* Done phase */}
      {phase === "done" && (
        <div className="flex flex-col items-center gap-6 py-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--success)]">
            <Check className="h-10 w-10 text-white" />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-bold text-white">Export Complete!</h3>
            <p className="mt-1 text-[var(--text-secondary)]">Your highlight is ready to share</p>
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

/**
 * Render a video clip segment to a downloadable WebM blob.
 * Uses MediaRecorder + Canvas for client-side composition.
 */
async function renderClipToBlob(
  videoUrl: string,
  trimStart: number,
  trimEnd: number,
  filterCSS: string,
  watermarkText: string | null,
  captionText: string,
  onProgress: (pct: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.src = videoUrl;
    video.preload = "auto";

    video.onloadeddata = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d")!;

      // Scale video to fill vertical canvas
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

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
        videoBitsPerSecond: 8_000_000,
      });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: "video/webm" }));
      };

      recorder.onerror = () => reject(new Error("Recording failed"));

      const duration = trimEnd - trimStart;
      video.currentTime = trimStart;

      video.onseeked = () => {
        recorder.start();
        video.play();

        const drawFrame = () => {
          if (video.currentTime >= trimEnd || video.paused) {
            video.pause();
            recorder.stop();
            return;
          }

          // Progress
          const elapsed = video.currentTime - trimStart;
          onProgress(Math.min(99, (elapsed / duration) * 100));

          // Draw video frame
          ctx.filter = filterCSS === "none" ? "none" : filterCSS;
          ctx.drawImage(video, drawX, drawY, drawW, drawH);
          ctx.filter = "none";

          // Watermark
          if (watermarkText) {
            ctx.save();
            ctx.globalAlpha = WATERMARK_OPACITY;
            ctx.font = "bold 28px -apple-system, sans-serif";
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.fillText(watermarkText, canvas.width / 2, canvas.height - 60);
            ctx.restore();
          }

          // Caption
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

          requestAnimationFrame(drawFrame);
        };

        requestAnimationFrame(drawFrame);
      };
    };

    video.onerror = () => reject(new Error("Failed to load video"));
  });
}
