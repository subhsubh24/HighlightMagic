"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useApp, getMediaFile } from "@/lib/store";
import { VIDEO_FILTERS } from "@/lib/filters";
import { getEditingStyle } from "@/lib/editing-styles";
import {
  getClipAlpha,
  getTransitionTransform,
  drawTransitionOverlay,
  getClipEntryScale,
  type TransitionType,
  type TransitionTransform,
} from "@/lib/transitions";
import { buildBeatGrid, getBeatIntensity, type BeatGrid } from "@/lib/beat-sync";
import { getSpeedAtPosition, getSpeedFromKeyframes } from "@/lib/velocity";
import { getKineticTransform, drawKineticCaption, type CustomCaptionParams } from "@/lib/kinetic-text";
import type { EditedClip } from "@/lib/types";

// ── Adaptive resolution: lower on mobile for smoother playback ──
const DESKTOP_WIDTH = 540;
const DESKTOP_HEIGHT = 960;
const MOBILE_WIDTH = 360;
const MOBILE_HEIGHT = 640;
/** Target frame interval in ms. 60fps on desktop, 30fps on mobile. */
const DESKTOP_FRAME_MS = 1000 / 60;
const MOBILE_FRAME_MS = 1000 / 30;

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  // Check touch support + screen width as a heuristic
  return (
    ("ontouchstart" in window || navigator.maxTouchPoints > 0) &&
    window.innerWidth < 768
  );
}

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
  const [isMuted, setIsMuted] = useState(true);
  const pbRef = useRef({ startWall: 0, elapsed: 0, raf: 0 });
  const mediaMapRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const activeClipsRef = useRef<Set<string>>(new Set());
  /** Tracks the last frame draw timestamp for frame budget/skipping. */
  const lastDrawRef = useRef(0);
  const isMobileRef = useRef(false);

  // Get the editing style for the detected theme
  const style = useMemo(() => getEditingStyle(state.detectedTheme), [state.detectedTheme]);

  const sortedClips = useMemo(
    () => [...state.clips].sort((a, b) => a.order - b.order),
    [state.clips]
  );

  // Fallback: "hard_cut" for any clip the AI didn't assign a transition to
  const fallbackTransition: TransitionType = "hard_cut";

  // Beat grid from the first clip's selected music track (shared across tape)
  const beatGrid = useMemo<BeatGrid | null>(() => {
    if (!state.viralOptions.beatSync) return null;
    const track = sortedClips.find((c) => c.selectedMusicTrack)?.selectedMusicTrack;
    if (!track) return null;
    return buildBeatGrid(track.bpm, 300);
  }, [sortedClips, state.viralOptions.beatSync]);

  // Build timeline with overlapping transitions (duration from theme)
  // When beat-sync is enabled, snap clip boundaries to beat grid
  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];
    let t = 0;
    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i];
      const media = getMediaFile(state, clip.sourceFileId);
      if (!media) continue;
      let dur = clip.trimEnd - clip.trimStart;

      // Beat-sync: snap duration to nearest beat boundary
      if (beatGrid && beatGrid.beatInterval > 0) {
        const beats = Math.max(2, Math.round(dur / beatGrid.beatInterval));
        dur = beats * beatGrid.beatInterval;
      }

      entries.push({
        clip,
        mediaUrl: media.url,
        mediaType: media.type,
        filterCSS: clip.customFilterCSS ?? VIDEO_FILTERS[clip.selectedFilter],
        captionText: clip.captionText,
        globalStart: t,
        globalEnd: t + dur,
        clipDuration: dur,
      });
      t += dur;
      if (i < sortedClips.length - 1 && sortedClips.length > 1) {
        // Use next clip's per-clip transition duration (neutral 0.3s default)
        const nextClip = sortedClips[i + 1];
        t -= nextClip?.transitionDuration ?? 0.3;
      }
    }
    return entries;
  }, [sortedClips, state.mediaFiles, beatGrid]);

  const totalDuration = timeline.length > 0 ? timeline[timeline.length - 1].globalEnd : 0;

  // Pre-load media elements
  useEffect(() => {
    const map = new Map<string, HTMLVideoElement | HTMLImageElement>();
    for (const entry of timeline) {
      // Check if this photo has been animated — use the generated video instead
      const mediaFile = getMediaFile(state, entry.clip.sourceFileId);
      const useAnimatedVideo = entry.mediaType === "photo" &&
        mediaFile?.animationStatus === "completed" &&
        mediaFile?.animatedVideoUrl;

      if (entry.mediaType === "video" || useAnimatedVideo) {
        const v = document.createElement("video");
        v.src = useAnimatedVideo ? mediaFile!.animatedVideoUrl! : entry.mediaUrl;
        v.muted = true; // Start muted; the mute-sync effect will update to current state
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
  }, [timeline, state.mediaFiles]);

  // Sync mute state to all active video elements
  useEffect(() => {
    for (const [, el] of mediaMapRef.current) {
      if (el instanceof HTMLVideoElement) {
        el.muted = isMuted;
      }
    }
  }, [isMuted]);

  // Set canvas size — lower resolution on mobile for smoother playback
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const mobile = isMobileDevice();
    isMobileRef.current = mobile;
    c.width = mobile ? MOBILE_WIDTH : DESKTOP_WIDTH;
    c.height = mobile ? MOBILE_HEIGHT : DESKTOP_HEIGHT;
  }, []);

  // Draw a single clip frame with transition transform, velocity, and kinetic text
  const drawMediaFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      entry: TimelineEntry,
      localTime: number,
      alpha: number,
      transform: TransitionTransform,
      kenBurnsIntensity: number,
      currentBeatIntensity: number
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

      // Ken Burns zoom for static photos only (animated photos are now video, skip Ken Burns)
      if (entry.mediaType === "photo" && !(el instanceof HTMLVideoElement)) {
        const p = Math.min(localTime / entry.clipDuration, 1);
        const scale = 1 + p * kenBurnsIntensity;
        dw *= scale;
        dh *= scale;
      }

      // Beat pulse: subtle scale bump on beats (adds satisfying rhythm feel)
      if (currentBeatIntensity > 0) {
        const pulseScale = 1 + currentBeatIntensity * 0.015;
        dw *= pulseScale;
        dh *= pulseScale;
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

      // Kinetic text instead of static caption
      if (entry.captionText) {
        ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
        const captionCustom: CustomCaptionParams | undefined =
          (entry.clip.customCaptionAnimation || entry.clip.customCaptionFontWeight || entry.clip.customCaptionColor || entry.clip.customCaptionGlowColor)
          ? {
              animation: entry.clip.customCaptionAnimation,
              fontWeight: entry.clip.customCaptionFontWeight,
              fontStyle: entry.clip.customCaptionFontStyle,
              fontFamily: entry.clip.customCaptionFontFamily,
              color: entry.clip.customCaptionColor,
              glowColor: entry.clip.customCaptionGlowColor,
              glowRadius: entry.clip.customCaptionGlowRadius,
            }
          : undefined;
        const kTransform = getKineticTransform(
          entry.clip.captionStyle,
          localTime,
          entry.clipDuration,
          h,
          captionCustom
        );
        drawKineticCaption(
          ctx,
          entry.captionText,
          entry.clip.captionStyle,
          kTransform,
          w,
          h,
          Math.round(h * 0.025),
          captionCustom
        );
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

      // Beat intensity for visual pulse
      const currentBeatIntensity = beatGrid ? getBeatIntensity(t, beatGrid) : 0;

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

        // Per-clip style values (AI-specified, neutral defaults as last resort)
        const clipTransDuration = e.clip.transitionDuration ?? 0.3;
        const clipEntryPunch = e.clip.entryPunchScale ?? 1.0;
        const clipEntryPunchDur = e.clip.entryPunchDuration ?? 0.15;
        const clipKenBurns = e.clip.kenBurnsIntensity ?? 0;

        // Incoming clip during transition
        if (i > 0 && lt < clipTransDuration) {
          const transType = (e.clip.transitionType as TransitionType) ?? fallbackTransition;
          const progress = lt / clipTransDuration;
          alpha = getClipAlpha(transType, progress, false);
          transform = getTransitionTransform(transType, progress, false, c.width);
          if (!activeTransInfo) activeTransInfo = { type: transType, progress, seed: i - 1 };
        }

        // Outgoing clip during transition
        if (i < timeline.length - 1) {
          const nextClip = timeline[i + 1];
          const nextTransDuration = nextClip?.clip.transitionDuration ?? 0.3;
          if (timeToEnd < nextTransDuration) {
            const transType = (nextClip?.clip.transitionType as TransitionType) ?? fallbackTransition;
            const progress = 1 - timeToEnd / nextTransDuration;
            alpha = getClipAlpha(transType, progress, true);
            transform = getTransitionTransform(transType, progress, true, c.width);
            if (!activeTransInfo) activeTransInfo = { type: transType, progress, seed: i };
          }
        }

        // Entry punch (per-clip or theme default)
        const entryScale = getClipEntryScale(lt, clipEntryPunch, clipEntryPunchDur);
        transform = { ...transform, scale: transform.scale * entryScale };

        drawMediaFrame(ctx, c.width, c.height, e, lt, alpha, transform, clipKenBurns, currentBeatIntensity);
      }

      // Transition overlay
      if (activeTransInfo) {
        drawTransitionOverlay(ctx, c.width, c.height, activeTransInfo.type, activeTransInfo.progress, activeTransInfo.seed);
      }

      // Beat flash overlay (subtle brightness pulse on strong beats — AI chose the theme, beat sync is user toggle)
      if (currentBeatIntensity > 0.5) {
        ctx.save();
        ctx.globalAlpha = (currentBeatIntensity - 0.5) * 0.12;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.restore();
      }

      // Manage video playback + velocity
      for (const id of nowActive) {
        const e = timeline.find((x) => x.clip.id === id);
        const el = mediaMapRef.current.get(id);
        if (el instanceof HTMLVideoElement && e) {
          // Apply velocity (playback rate) — custom keyframes take priority over presets
          const customKf = e.clip.customVelocityKeyframes;
          const preset = e.clip.velocityPreset ?? "normal";
          if (customKf && customKf.length >= 2) {
            const posInClip = Math.min(1, (t - e.globalStart) / e.clipDuration);
            const speed = getSpeedFromKeyframes(posInClip, customKf);
            const clampedSpeed = Math.max(0.1, Math.min(4, speed));
            if (Math.abs(el.playbackRate - clampedSpeed) > 0.05) {
              el.playbackRate = clampedSpeed;
            }
          } else if (preset !== "normal") {
            const posInClip = Math.min(1, (t - e.globalStart) / e.clipDuration);
            const speed = getSpeedAtPosition(posInClip, preset);
            const clampedSpeed = Math.max(0.1, Math.min(4, speed));
            if (Math.abs(el.playbackRate - clampedSpeed) > 0.05) {
              el.playbackRate = clampedSpeed;
            }
          }

          if (!activeClipsRef.current.has(id)) {
            el.currentTime = e.clip.trimStart + (t - e.globalStart);
            el.play().catch(() => {});
          }
        }
      }
      for (const id of activeClipsRef.current) {
        if (!nowActive.has(id)) {
          const el = mediaMapRef.current.get(id);
          if (el instanceof HTMLVideoElement) {
            el.pause();
            el.playbackRate = 1;
          }
        }
      }
      activeClipsRef.current = nowActive;
    },
    [timeline, fallbackTransition, drawMediaFrame, beatGrid]
  );

  // Animation loop with adaptive frame skipping for mobile performance
  const tick = useCallback(() => {
    const pb = pbRef.current;
    const nowMs = performance.now();
    const now = nowMs / 1000;
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

    // Frame budget: skip draw if we're behind the target frame rate
    const targetMs = isMobileRef.current ? MOBILE_FRAME_MS : DESKTOP_FRAME_MS;
    const elapsed = nowMs - lastDrawRef.current;

    if (elapsed >= targetMs) {
      setProgress(currentTime / totalDuration);
      drawAtTime(currentTime);
      lastDrawRef.current = nowMs;
    }

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

        {/* Audio toggle */}
        <button
          onClick={() => setIsMuted((m) => !m)}
          className="absolute right-2 bottom-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-opacity hover:bg-black/70"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4 text-white/70" />
          ) : (
            <Volume2 className="h-4 w-4 text-white" />
          )}
        </button>

        {/* Beat sync indicator */}
        {beatGrid && (
          <div className="absolute left-2 bottom-3 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-emerald-400 backdrop-blur-sm">
            {beatGrid.bpm} BPM
          </div>
        )}
      </div>

      {/* Timeline with beat markers */}
      <div className="relative h-7 rounded-full bg-white/10 overflow-hidden">
        {/* Beat markers */}
        {beatGrid && totalDuration > 0 && beatGrid.beats
          .filter((b) => b <= totalDuration)
          .map((beat, i) => (
            <div
              key={i}
              className="absolute top-0 h-full w-px bg-white/10"
              style={{ left: `${(beat / totalDuration) * 100}%` }}
            />
          ))}
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
