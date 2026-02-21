"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { useApp, getMediaFile } from "@/lib/store";
import { VIDEO_FILTERS } from "@/lib/filters";
import { getEditingStyle, getThemeTransitions } from "@/lib/editing-styles";
import {
  getClipAlpha,
  getTransitionTransform,
  drawTransitionOverlay,
  getClipEntryScale,
  type TransitionType,
  type TransitionTransform,
} from "@/lib/transitions";
import type { EditedClip } from "@/lib/types";

const PREVIEW_WIDTH = 540;
const PREVIEW_HEIGHT = 960;

interface TimelineEntry {
  clip: EditedClip;
  mediaUrl: string;
  mediaType: "video" | "photo";
  filterCSS: string;
  captionText: string;
  globalStart: number;
  globalEnd: number;
  clipDuration: number;
}

export default function TapePreviewPlayer() {
  const { state } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playerState, setPlayerState] = useState<"idle" | "playing" | "paused">("idle");
  const [progress, setProgress] = useState(0);
  const pbRef = useRef({ startWall: 0, elapsed: 0, raf: 0 });
  const mediaMapRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const activeClipsRef = useRef<Set<string>>(new Set());

  // Get the editing style for the detected theme
  const style = useMemo(() => getEditingStyle(state.detectedTheme), [state.detectedTheme]);

  const sortedClips = useMemo(
    () => [...state.clips].sort((a, b) => a.order - b.order),
    [state.clips]
  );

  // Theme-aware transitions
  const transitions = useMemo<TransitionType[]>(
    () => getThemeTransitions(state.detectedTheme, Math.max(0, sortedClips.length - 1)),
    [state.detectedTheme, sortedClips.length]
  );

  // Build timeline with overlapping transitions (duration from theme)
  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];
    let t = 0;
    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i];
      const media = getMediaFile(state, clip.sourceFileId);
      if (!media) continue;
      const dur = clip.trimEnd - clip.trimStart;
      entries.push({
        clip,
        mediaUrl: media.url,
        mediaType: media.type,
        filterCSS: VIDEO_FILTERS[clip.selectedFilter],
        captionText: clip.captionText,
        globalStart: t,
        globalEnd: t + dur,
        clipDuration: dur,
      });
      t += dur;
      if (i < sortedClips.length - 1 && sortedClips.length > 1) {
        t -= style.transitionDuration;
      }
    }
    return entries;
  }, [sortedClips, state, style.transitionDuration]);

  const totalDuration = timeline.length > 0 ? timeline[timeline.length - 1].globalEnd : 0;

  // Pre-load media elements
  useEffect(() => {
    const map = new Map<string, HTMLVideoElement | HTMLImageElement>();
    for (const entry of timeline) {
      if (entry.mediaType === "video") {
        const v = document.createElement("video");
        v.src = entry.mediaUrl;
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        map.set(entry.clip.id, v);
      } else {
        const img = new window.Image();
        img.src = entry.mediaUrl;
        map.set(entry.clip.id, img);
      }
    }
    mediaMapRef.current = map;
    return () => {
      for (const [, el] of map) {
        if (el instanceof HTMLVideoElement) {
          el.pause();
          el.removeAttribute("src");
          el.load();
        }
      }
    };
  }, [timeline]);

  // Set canvas size
  useEffect(() => {
    const c = canvasRef.current;
    if (c) {
      c.width = PREVIEW_WIDTH;
      c.height = PREVIEW_HEIGHT;
    }
  }, []);

  // Draw a single clip frame with transition transform
  const drawMediaFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      entry: TimelineEntry,
      localTime: number,
      alpha: number,
      transform: TransitionTransform,
      kenBurnsIntensity: number
    ) => {
      const el = mediaMapRef.current.get(entry.clip.id);
      if (!el) return;
      if (el instanceof HTMLVideoElement && el.readyState < 2) return;
      if (el instanceof HTMLImageElement && !el.complete) return;
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
      if (entry.filterCSS !== "none") ctx.filter = entry.filterCSS;

      let sw: number, sh: number;
      if (el instanceof HTMLVideoElement) {
        sw = el.videoWidth || w;
        sh = el.videoHeight || h;
      } else {
        sw = el.naturalWidth || w;
        sh = el.naturalHeight || h;
      }

      const sa = sw / sh;
      const ca = w / h;
      let dw: number, dh: number;
      if (sa > ca) {
        dh = h;
        dw = dh * sa;
      } else {
        dw = w;
        dh = dw / sa;
      }

      // Ken Burns zoom for photos (intensity from theme)
      if (entry.mediaType === "photo") {
        const p = Math.min(localTime / entry.clipDuration, 1);
        const scale = 1 + p * kenBurnsIntensity;
        dw *= scale;
        dh *= scale;
      }

      // Apply transition transform
      dw *= transform.scale;
      dh *= transform.scale;
      const dx = (w - dw) / 2 + transform.offsetX;
      const dy = (h - dh) / 2 + transform.offsetY;

      try {
        ctx.drawImage(el, dx, dy, dw, dh);
      } catch {
        /* media not ready */
      }

      ctx.filter = "none";

      if (entry.captionText) {
        ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
        ctx.font = `bold ${Math.round(h * 0.025)}px -apple-system, sans-serif`;
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.7)";
        ctx.shadowBlur = 4;
        ctx.fillText(entry.captionText, w / 2, h * 0.89);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    },
    []
  );

  // Draw the full canvas state at a given time
  const drawAtTime = useCallback(
    (t: number) => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, c.width, c.height);

      const nowActive = new Set<string>();
      let activeTransInfo: { type: TransitionType; progress: number; seed: number } | null = null;

      for (let i = 0; i < timeline.length; i++) {
        const e = timeline[i];
        if (t < e.globalStart || t > e.globalEnd) continue;

        nowActive.add(e.clip.id);
        const lt = t - e.globalStart;
        const timeToEnd = e.globalEnd - t;

        let alpha = 1;
        let transform: TransitionTransform = { scale: 1, offsetX: 0, offsetY: 0 };

        // Incoming clip during transition
        if (i > 0 && lt < style.transitionDuration) {
          const transType = transitions[i - 1];
          const progress = lt / style.transitionDuration;
          alpha = getClipAlpha(transType, progress, false);
          transform = getTransitionTransform(transType, progress, false, c.width);
          if (!activeTransInfo) activeTransInfo = { type: transType, progress, seed: i - 1 };
        }

        // Outgoing clip during transition
        if (i < timeline.length - 1 && timeToEnd < style.transitionDuration) {
          const transType = transitions[i];
          const progress = 1 - timeToEnd / style.transitionDuration;
          alpha = getClipAlpha(transType, progress, true);
          transform = getTransitionTransform(transType, progress, true, c.width);
          if (!activeTransInfo) activeTransInfo = { type: transType, progress, seed: i };
        }

        // Entry punch (customizable per theme)
        const entryScale = getClipEntryScale(lt, style.entryPunchScale, style.entryPunchDuration);
        transform = { ...transform, scale: transform.scale * entryScale };

        drawMediaFrame(ctx, c.width, c.height, e, lt, alpha, transform, style.kenBurnsIntensity);
      }

      // Transition overlay
      if (activeTransInfo) {
        drawTransitionOverlay(ctx, c.width, c.height, activeTransInfo.type, activeTransInfo.progress, activeTransInfo.seed);
      }

      // Manage video playback
      for (const id of nowActive) {
        if (!activeClipsRef.current.has(id)) {
          const e = timeline.find((x) => x.clip.id === id);
          const el = mediaMapRef.current.get(id);
          if (el instanceof HTMLVideoElement && e) {
            el.currentTime = e.clip.trimStart + (t - e.globalStart);
            el.play().catch(() => {});
          }
        }
      }
      for (const id of activeClipsRef.current) {
        if (!nowActive.has(id)) {
          const el = mediaMapRef.current.get(id);
          if (el instanceof HTMLVideoElement) el.pause();
        }
      }
      activeClipsRef.current = nowActive;
    },
    [timeline, transitions, style, drawMediaFrame]
  );

  // Animation loop
  const tick = useCallback(() => {
    const pb = pbRef.current;
    const now = performance.now() / 1000;
    const currentTime = pb.elapsed + (now - pb.startWall);

    if (currentTime >= totalDuration) {
      cancelAnimationFrame(pb.raf);
      setPlayerState("idle");
      setProgress(1);
      for (const [, el] of mediaMapRef.current) {
        if (el instanceof HTMLVideoElement) el.pause();
      }
      activeClipsRef.current = new Set();
      return;
    }

    setProgress(currentTime / totalDuration);
    drawAtTime(currentTime);
    pb.raf = requestAnimationFrame(tick);
  }, [totalDuration, drawAtTime]);

  const play = useCallback(() => {
    const pb = pbRef.current;
    if (progress >= 1) {
      pb.elapsed = 0;
      setProgress(0);
    }
    pb.startWall = performance.now() / 1000;
    setPlayerState("playing");
    pb.raf = requestAnimationFrame(tick);
  }, [tick, progress]);

  const pause = useCallback(() => {
    const pb = pbRef.current;
    const now = performance.now() / 1000;
    pb.elapsed += now - pb.startWall;
    cancelAnimationFrame(pb.raf);
    setPlayerState("paused");
    for (const [, el] of mediaMapRef.current) {
      if (el instanceof HTMLVideoElement) el.pause();
    }
  }, []);

  const restart = useCallback(() => {
    const pb = pbRef.current;
    cancelAnimationFrame(pb.raf);
    pb.elapsed = 0;
    setProgress(0);
    activeClipsRef.current = new Set();
    for (const [, el] of mediaMapRef.current) {
      if (el instanceof HTMLVideoElement) el.pause();
    }
    play();
  }, [play]);

  // Draw first frame after media loads
  useEffect(() => {
    const t = setTimeout(() => drawAtTime(0), 500);
    return () => clearTimeout(t);
  }, [drawAtTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(pbRef.current.raf);
      for (const [, el] of mediaMapRef.current) {
        if (el instanceof HTMLVideoElement) el.pause();
      }
    };
  }, []);

  if (timeline.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black">
        <canvas ref={canvasRef} className="h-full w-full" />

        {playerState !== "playing" && (
          <button
            onClick={play}
            className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/20"
            aria-label="Play preview"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <Play className="ml-1 h-7 w-7 text-white" />
            </div>
          </button>
        )}

        {playerState === "playing" && (
          <button
            onClick={pause}
            className="absolute bottom-3 left-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-opacity hover:bg-black/70"
            aria-label="Pause"
          >
            <Pause className="h-5 w-5 text-white" />
          </button>
        )}

        <div className="absolute right-2 top-2 rounded-md bg-black/50 px-2 py-0.5 text-xs font-mono text-white backdrop-blur-sm">
          {Math.round(progress * totalDuration)}s / {Math.round(totalDuration)}s
        </div>

        <div className="absolute left-2 top-2 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
          {style.label} style
        </div>
      </div>

      {/* Timeline */}
      <div className="relative h-7 rounded-full bg-white/10 overflow-hidden">
        {timeline.map((e, i) => (
          <div
            key={e.clip.id}
            className="absolute top-0 h-full border-r border-white/20 last:border-r-0"
            style={{
              left: `${(e.globalStart / totalDuration) * 100}%`,
              width: `${(e.clipDuration / totalDuration) * 100}%`,
            }}
          >
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white/40">
              {i + 1}
            </span>
          </div>
        ))}
        <div
          className="absolute top-0 h-full bg-[var(--accent)]/30 transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-white"
          style={{ left: `${Math.min(progress * 100, 100)}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {playerState === "playing" ? (
          <button
            onClick={pause}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-4 py-2 text-xs text-white hover:bg-white/10"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause
          </button>
        ) : (
          <button
            onClick={play}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            <Play className="ml-0.5 h-3.5 w-3.5" />
            {progress >= 1 ? "Replay" : progress > 0 ? "Resume" : "Play Tape"}
          </button>
        )}
        {progress > 0 && playerState !== "playing" && (
          <button
            onClick={restart}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs text-[var(--text-tertiary)] hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restart
          </button>
        )}
      </div>
    </div>
  );
}
