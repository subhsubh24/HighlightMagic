"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { extractFramesFromMultiple, type ExtractedFrame } from "@/lib/frame-extractor";
import {
  scoreSingleBatch,
  submitScoringBatch,
  pollScoringBatch,
  retrieveScoringResults,
  type DetectionResult,
  type DetectedClip,
} from "@/actions/detect";
import { buildFrameBatches, buildSourceFileList } from "@/lib/frame-batching";
import { templateToTheme } from "@/lib/editing-styles";
import { ALL_VELOCITY_PRESETS, type VelocityPreset } from "@/lib/velocity";
import { uuid } from "@/lib/utils";
import { cacheDetectionData, getCachedDetectionData } from "@/lib/detection-cache";
import { pollBatched, cancelAllPolls } from "@/lib/poll-manager";
import { cacheKey, getCachedAsset, setCachedAsset } from "@/lib/asset-cache";

const DEBUG = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEBUG === "1";
function debugLog(...args: unknown[]) { if (DEBUG) console.log(...args); }

/** Convert DetectedClips to app-level highlights. */
function buildHighlights(detectedClips: DetectedClip[]) {
  return detectedClips.map((c) => ({
    id: c.id,
    sourceFileId: c.sourceFileId,
    startTime: c.startTime,
    endTime: c.endTime,
    confidenceScore: c.confidenceScore,
    label: c.label,
    detectionSources: ["Cloud AI"],
  }));
}

/** Convert DetectedClips to app-level EditedClips. */
function buildClips(detectedClips: DetectedClip[], selectedTemplate: import("@/lib/types").HighlightTemplate | null) {
  return detectedClips.map((c, i) => ({
    id: uuid(),
    sourceFileId: c.sourceFileId,
    segment: {
      id: c.id,
      sourceFileId: c.sourceFileId,
      startTime: c.startTime,
      endTime: c.endTime,
      confidenceScore: c.confidenceScore,
      label: c.label,
      detectionSources: ["Cloud AI"],
    },
    trimStart: c.startTime,
    trimEnd: c.endTime,
    order: c.order ?? i,
    selectedMusicTrack: null,
    captionText: c.captionText ?? "",
    captionStyle: (c.captionStyle ?? "Bold") as "Bold" | "Minimal" | "Neon" | "Classic",
    selectedFilter: (c.filter ?? selectedTemplate?.suggestedFilter ?? "None") as import("@/lib/types").VideoFilter,
    velocityPreset: ALL_VELOCITY_PRESETS.includes(c.velocityPreset as VelocityPreset)
      ? (c.velocityPreset as VelocityPreset)
      : (c.velocityPreset ? console.warn(`[AI] Unknown velocity preset "${c.velocityPreset}" for clip ${i}, falling back to "normal"`) : null, "normal" as VelocityPreset),
    transitionType: c.transitionType,
    transitionDuration: c.transitionDuration,
    entryPunchScale: c.entryPunchScale,
    entryPunchDuration: c.entryPunchDuration,
    kenBurnsIntensity: c.kenBurnsIntensity,
    customVelocityKeyframes: c.customVelocityKeyframes,
    customFilterCSS: c.customFilterCSS,
    customCaptionFontWeight: c.customCaptionFontWeight,
    customCaptionFontStyle: c.customCaptionFontStyle,
    customCaptionFontFamily: c.customCaptionFontFamily,
    customCaptionColor: c.customCaptionColor,
    customCaptionAnimation: c.customCaptionAnimation,
    customCaptionGlowColor: c.customCaptionGlowColor,
    customCaptionGlowRadius: c.customCaptionGlowRadius,
    clipAudioVolume: c.clipAudioVolume,
    transitionIntensity: c.transitionIntensity,
    beatPulseIntensity: c.beatPulseIntensity,
    beatFlashOpacity: c.beatFlashOpacity,
    audioFadeIn: c.audioFadeIn,
    audioFadeOut: c.audioFadeOut,
    captionAnimationIntensity: c.captionAnimationIntensity,
    beatFlashThreshold: c.beatFlashThreshold,
    captionIdlePulse: c.captionIdlePulse,
    customCaptionGlowSpread: c.customCaptionGlowSpread,
  }));
}

const DETECTION_PASSES = [
  "Extracting frames from all clips...",
  "Scoring the best moments...",
  "Planning your highlight tape...",
  "Applying editing style for best flow...",
];

const BATCH_DETECTION_PASSES = [
  "Extracting frames from all clips...",
  "Submitting frames to AI (economy mode)...",
  "Waiting for batch results...",
  "Planning your highlight tape...",
  "Applying editing style for best flow...",
];

/** Minimum total frame count before Batch API mode kicks in (saves 50% on scoring cost).
 *  Photo-only uploads produce 1 frame each — batch API overhead is wasteful for small counts. */
const BATCH_MODE_FRAME_THRESHOLD = 50;
/** Polling interval for Batch API status checks. */
const BATCH_POLL_INTERVAL_MS = 5_000;

const REPLAN_PASSES = [
  "Re-planning with your direction...",
  "Applying editing style for best flow...",
];

/** Threshold in seconds before showing "taking longer than expected". */
const SLOW_THRESHOLD_S = 90;
/** Threshold in seconds before showing a more detailed warning. */
const VERY_SLOW_THRESHOLD_S = 240;

/** Max time (ms) to wait for the next SSE chunk from the server before aborting.
 * Set high to allow for Opus extended thinking (can take 2-3 min on complex edits).
 * Keepalive pings every 15s ensure the connection stays alive. */
const SSE_READ_TIMEOUT_MS = 300_000;

/**
 * Call the planner via SSE route handler (/api/plan).
 * The route sends keepalive pings every 15s so the connection doesn't drop
 * during the 2-5 minute Opus response.
 */
async function callPlannerSSE(
  frames: unknown[],
  scores: unknown[],
  templateName?: string,
  userFeedback?: string,
  creativeDirection?: string,
  onPhase?: (phase: "thinking" | "generating") => void,
  photoAnimations?: Array<{ sourceFileId: string; animatePhoto: boolean; animationInstructions: string }>,
  signal?: AbortSignal,
  onPartial?: (field: string, value: unknown) => void
): Promise<DetectionResult> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frames, scores, templateName, userFeedback, creativeDirection, photoAnimations }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Planner request failed (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function processBuffer(): DetectionResult | null {
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let eventType = "";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }

      if (eventType === "result") {
        try {
          return JSON.parse(data) as DetectionResult;
        } catch {
          throw new Error("Failed to parse planner result — server returned invalid JSON");
        }
      }
      if (eventType === "error") {
        let message = data || "Unknown planner error";
        try { message = JSON.parse(data).message || message; } catch { /* use raw data */ }
        throw new Error(message);
      }
      if (eventType === "phase") {
        try {
          const { phase } = JSON.parse(data);
          onPhase?.(phase);
        } catch (e) { console.warn("[SSE] Failed to parse phase event:", e, data); }
      }
      if (eventType === "partial") {
        try {
          const { field, value } = JSON.parse(data);
          onPartial?.(field, value);
        } catch (e) { console.warn("[SSE] Failed to parse partial event:", e, data); }
      }
      // keepalive events — just ignore, they keep the connection alive
    }
    return null;
  }

  while (true) {
    // Race against a timeout so we don't hang forever if the server
    // stops sending data (including keepalive pings).
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Lost connection to server — no data received for 5 minutes. Please try again.")), SSE_READ_TIMEOUT_MS);
    });
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await Promise.race([reader.read(), timeout]);
    } finally {
      clearTimeout(timer!);
    }
    const { done, value } = chunk;
    if (done) {
      // Flush any remaining bytes from the decoder
      buffer += decoder.decode();
      const finalResult = processBuffer();
      if (finalResult) return finalResult;
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const result = processBuffer();
    if (result) return result;
  }

  throw new Error("Planner stream ended without a result");
}

export default function DetectingStep() {
  const { state, dispatch } = useApp();
  const [progress, setProgress] = useState(0);
  const [passIndex, setPassIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSlow, setIsSlow] = useState(false);
  const [isVerySlow, setIsVerySlow] = useState(false);
  const [animatingPhotos, setAnimatingPhotos] = useState(false);
  const [animationProgress, setAnimationProgress] = useState<{ total: number; completed: number; failed: number }>({ total: 0, completed: 0, failed: 0 });
  const [plannerElapsed, setPlannerElapsed] = useState(0);
  const [batchMode, setBatchMode] = useState(false);
  const batchModeRef = useRef(false);
  const hasStarted = useRef(false);
  const abortRef = useRef<AbortController>(new AbortController());
  const animationAbortRef = useRef<AbortController | null>(null);
  /** Early-started music promise from streaming partial fields (Arch #4). */
  const earlyMusicPromiseRef = useRef<Promise<string | null> | null>(null);
  /** Early-started SFX status flag — prevents double-starting in processResult. */
  const earlySfxStartedRef = useRef(false);
  const phaseStartRef = useRef(Date.now());
  const slowTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Keep a ref to the latest mediaFiles so long-running async code
  // (animations, validation) reads current state, not the stale closure.
  const mediaFilesRef = useRef(state.mediaFiles);
  mediaFilesRef.current = state.mediaFiles;

  const fileCount = state.mediaFiles.length;
  const isReplan = !!state.regenerateFeedback;

  // Reset the slow timers whenever the pass/phase changes
  const verySlowTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    setIsSlow(false);
    setIsVerySlow(false);
    phaseStartRef.current = Date.now();
    clearTimeout(slowTimerRef.current);
    clearTimeout(verySlowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_S * 1000);
    verySlowTimerRef.current = setTimeout(() => setIsVerySlow(true), VERY_SLOW_THRESHOLD_S * 1000);
    return () => {
      clearTimeout(slowTimerRef.current);
      clearTimeout(verySlowTimerRef.current);
    };
  }, [passIndex]);

  // Tick the planner elapsed timer every second while on the planner pass.
  // Normal mode = pass 2, batch mode = pass 3, replan = pass 0.
  const isPlannerPass =
    (isReplan && passIndex === 0) ||
    (!isReplan && !batchMode && passIndex === 2) ||
    (!isReplan && batchMode && passIndex === 3);
  useEffect(() => {
    if (!isPlannerPass) {
      setPlannerElapsed(0);
      return;
    }
    const start = Date.now();
    setPlannerElapsed(0);
    const id = setInterval(() => {
      setPlannerElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isPlannerPass]);

  useEffect(() => {
    // Always register cleanup for real unmount — React Strict Mode fires the
    // first cleanup during its simulated unmount, but the second mount still
    // needs a cleanup for when the component ACTUALLY unmounts.
    const cleanupFn = () => {
      abortRef.current.abort("DetectingStep unmounted");
      animationAbortRef.current?.abort("DetectingStep unmounted");
      cancelAllPolls();
    };

    if (hasStarted.current) return cleanupFn;
    hasStarted.current = true;
    earlyMusicPromiseRef.current = null;
    earlySfxStartedRef.current = false;
    let abort = abortRef.current;

    // ── Early generator start from streaming partial fields (Arch #4) ──
    // Start music/SFX as soon as the planner streams the relevant field,
    // saving 10-20s vs waiting for the full plan.
    function startMusicEarly(prompt: string, durationMs?: number) {
      if (earlyMusicPromiseRef.current) return; // Already started
      if (!state.aiMusicEnabled || state.aiMusicStatus === "completed") return;
      // Skip early start if duration is suspiciously short — the planner may have
      // emitted a per-clip duration rather than the total tape length. The full
      // plan path in processResult will use the corrected duration.
      if (durationMs !== undefined && durationMs < 10_000) return;

      const musicCK = cacheKey("music", { prompt, durationMs });
      const cached = getCachedAsset(musicCK);
      if (cached) {
        debugLog("[Music] Early start — cache hit");
        dispatch({ type: "SET_AI_MUSIC_RESULT", status: "completed", audioUrl: cached.data });
        earlyMusicPromiseRef.current = Promise.resolve(cached.data);
        return;
      }

      debugLog("[Music] Early start from streaming partial field");
      dispatch({ type: "SET_AI_MUSIC_RESULT", status: "generating" });
      earlyMusicPromiseRef.current = (async () => {
        try {
          const res = await fetch("/api/music/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, durationMs }),
            signal: abort.signal,
          });
          const data = await res.json();
          if (!res.ok || data.status !== "completed" || !data.audioUrl) {
            dispatch({ type: "SET_AI_MUSIC_RESULT", status: "failed" });
            return null;
          }
          setCachedAsset(musicCK, data.audioUrl);
          dispatch({ type: "SET_AI_MUSIC_RESULT", status: "completed", audioUrl: data.audioUrl });
          return data.audioUrl as string;
        } catch (e) {
          console.error("[Music] Early start failed:", e);
          dispatch({ type: "SET_AI_MUSIC_RESULT", status: "failed" });
          return null;
        }
      })();
    }

    function startSfxEarly(sfxCues: Array<{ clipIndex: number; timing: string; prompt: string; durationMs: number }>) {
      if (earlySfxStartedRef.current || sfxCues.length === 0) return;
      earlySfxStartedRef.current = true;
      debugLog(`[SFX] Early start from streaming partial — ${sfxCues.length} cues`);

      dispatch({ type: "SET_SFX_STATUS", status: "generating" });
      dispatch({
        type: "SET_SFX_TRACKS",
        tracks: sfxCues.map((s) => ({
          clipIndex: s.clipIndex,
          timing: s.timing as "before" | "on" | "after",
          prompt: s.prompt,
          durationMs: s.durationMs,
          status: "generating" as const,
        })),
      });
      // Fire off SFX with concurrency limit (ElevenLabs allows max 4 parallel)
      const SFX_CONCURRENCY = 3;
      const sfxQueue = [...sfxCues];
      let activeCount = 0;
      let resolveAll: () => void;
      const allDone = new Promise<void>((r) => { resolveAll = r; });

      async function processSfx(sfxCue: typeof sfxCues[number]) {
        try {
          const sfxCK = cacheKey("sfx", { prompt: sfxCue.prompt, durationMs: sfxCue.durationMs });
          const cachedSfx = getCachedAsset(sfxCK);
          if (cachedSfx) {
            dispatch({ type: "UPDATE_SFX_TRACK", clipIndex: sfxCue.clipIndex, audioUrl: cachedSfx.data, status: "completed" });
            return;
          }
          const res = await fetch("/api/sfx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: sfxCue.prompt, durationMs: sfxCue.durationMs }),
            signal: abort.signal,
          });
          const data = await res.json();
          if (res.ok && data.status === "completed" && data.audioUrl) {
            setCachedAsset(sfxCK, data.audioUrl);
            dispatch({ type: "UPDATE_SFX_TRACK", clipIndex: sfxCue.clipIndex, audioUrl: data.audioUrl, status: "completed" });
          } else {
            dispatch({ type: "UPDATE_SFX_TRACK", clipIndex: sfxCue.clipIndex, audioUrl: "", status: "failed" });
          }
        } catch (e) {
          console.error(`[SFX] Early cue ${sfxCue.clipIndex} failed:`, e);
          dispatch({ type: "UPDATE_SFX_TRACK", clipIndex: sfxCue.clipIndex, audioUrl: "", status: "failed" });
        }
      }

      function runNext() {
        if (sfxQueue.length === 0 && activeCount === 0) {
          resolveAll!();
          return;
        }
        while (activeCount < SFX_CONCURRENCY && sfxQueue.length > 0) {
          const next = sfxQueue.shift()!;
          activeCount++;
          processSfx(next).finally(() => { activeCount--; runNext(); });
        }
      }
      runNext();

      allDone.then(() => dispatch({ type: "SET_SFX_STATUS", status: "completed" }))
        .catch(() => dispatch({ type: "SET_SFX_STATUS", status: "failed" }));
    }

    let earlyMusicDurationMs: number | undefined;
    let earlyMusicPrompt: string | undefined;
    function handlePartialField(field: string, value: unknown) {
      if (field === "musicPrompt" && typeof value === "string") {
        earlyMusicPrompt = value;
        // If duration already arrived, start immediately; otherwise defer
        // until musicDurationMs arrives (or processResult starts it with full plan)
        if (earlyMusicDurationMs !== undefined) {
          startMusicEarly(value, earlyMusicDurationMs);
        }
      } else if (field === "musicDurationMs" && typeof value === "number") {
        earlyMusicDurationMs = value;
        // If musicPrompt already arrived, start now with the correct duration
        if (earlyMusicPrompt) {
          startMusicEarly(earlyMusicPrompt, value);
        }
      } else if (field === "sfx" && Array.isArray(value)) {
        startSfxEarly(value as Array<{ clipIndex: number; timing: string; prompt: string; durationMs: number }>);
      }
    }

    // Build photo animation info from upload step selections
    const photoAnimations = state.mediaFiles
      .filter((f) => f.type === "photo" && f.animatePhoto)
      .map((f) => ({
        sourceFileId: f.id,
        animatePhoto: true,
        animationInstructions: f.animationInstructions ?? "",
      }));

    if (isReplan) {
      runReplan();
    } else {
      runDetection();
    }

    async function runReplan() {
      let plannerTimer: ReturnType<typeof setInterval> | undefined;
      try {
        const cached = getCachedDetectionData(
          mediaFilesRef.current.map((f) => ({ name: f.name, size: f.file?.size }))
        );
        if (!cached.frames || !cached.scores) {
          // Cache miss — fall back to full detection
          console.warn("Replan: no cached data, falling back to full detection");
          dispatch({ type: "SET_REGENERATE_FEEDBACK", feedback: null });
          return runDetection();
        }

        setPassIndex(0); // "Re-planning with your direction..."
        setProgress(10);

        // Slow fallback timer — creeps toward 75% so progress never looks stuck
        let replanPhaseReceived = false;
        plannerTimer = setInterval(() => {
          if (replanPhaseReceived) return;
          setProgress((prev) => {
            const ceiling = 75;
            const remaining = ceiling - prev;
            const increment = Math.max(0.05, remaining * 0.008);
            return Math.min(prev + increment, ceiling);
          });
        }, 500);

        // Fix Strict Mode abort — same logic as runDetection
        if (abort.signal.aborted) {
          const fresh = new AbortController();
          abortRef.current = fresh;
          abort = fresh;
        }
        const result = await callPlannerSSE(
          cached.frames,
          cached.scores,
          state.selectedTemplate?.name,
          state.regenerateFeedback ?? undefined,
          state.creativeDirection || undefined,
          (phase) => {
            replanPhaseReceived = true;
            clearInterval(plannerTimer);
            if (phase === "thinking") {
              setProgress((prev) => Math.max(prev, 45));
            } else if (phase === "generating") {
              setProgress(82);
            }
          },
          photoAnimations.length > 0 ? photoAnimations : undefined,
          abort.signal,
          handlePartialField
        );

        clearInterval(plannerTimer);

        // Clear feedback so we don't re-trigger on next mount
        dispatch({ type: "SET_REGENERATE_FEEDBACK", feedback: null });

        await processResult(result);
      } catch (err) {
        clearInterval(plannerTimer);
        dispatch({ type: "SET_REGENERATE_FEEDBACK", feedback: null });
        handleError(err);
      }
    }

    /** Real-time scoring: fire batches concurrently in waves. */
    async function runRealtimeScoring(
      batches: ExtractedFrame[][],
      sourceFileList: ReturnType<typeof buildSourceFileList>
    ) {
      setPassIndex(1);
      setProgress(30);

      const allScores: Awaited<ReturnType<typeof scoreSingleBatch>> = [];
      const SCORING_CONCURRENCY = 10;
      const STAGGER_MS = 500;
      let completedBatches = 0;
      let launchedBatches = 0;

      for (let w = 0; w < batches.length; w += SCORING_CONCURRENCY) {
        const wave = batches.slice(w, w + SCORING_CONCURRENCY);
        const waveResults = await Promise.all(
          wave.map(async (batch, i) => {
            if (i > 0) await new Promise((r) => setTimeout(r, i * STAGGER_MS));
            launchedBatches++;
            // Show launch progress (30-40%) then completion progress (40-58%)
            if (batches.length > 0) {
              setProgress(Math.round(30 + (launchedBatches / batches.length) * 10));
            }
            const scores = await scoreSingleBatch(
              batch,
              sourceFileList,
              state.selectedTemplate?.name
            );
            completedBatches++;
            if (batches.length > 0) {
              setProgress(Math.round(40 + (completedBatches / batches.length) * 18));
            }
            return scores;
          })
        );
        allScores.push(...waveResults.flat());
      }
      return allScores;
    }

    /** Batch API scoring: submit all at once, poll, retrieve. 50% cheaper. */
    async function runBatchScoring(
      batches: ExtractedFrame[][],
      sourceFileList: ReturnType<typeof buildSourceFileList>
    ) {
      // Submit
      setPassIndex(1);
      setProgress(32);
      const { batchId, manifest } = await submitScoringBatch(
        batches,
        sourceFileList,
        state.selectedTemplate?.name
      );

      // Poll until complete — show real progress from batch counts
      setPassIndex(2);
      setProgress(35);
      let pollCount = 0;
      let status: Awaited<ReturnType<typeof pollScoringBatch>>;
      do {
        if (abort.signal.aborted) throw new Error("Batch scoring aborted");
        await new Promise((r) => setTimeout(r, BATCH_POLL_INTERVAL_MS));
        if (abort.signal.aborted) throw new Error("Batch scoring aborted");
        status = await pollScoringBatch(batchId);
        pollCount++;
        const total = status.counts.processing + status.counts.succeeded +
          status.counts.errored + status.counts.canceled + status.counts.expired;
        const done = status.counts.succeeded + status.counts.errored +
          status.counts.canceled + status.counts.expired;
        if (total > 0 && done > 0) {
          setProgress(Math.round(35 + (done / total) * 20));
        } else {
          // No batches done yet — creep slowly so user sees activity
          setProgress((prev) => Math.min(prev + 0.5, 42));
        }
      } while (status.status === "in_progress");

      if (status.counts.succeeded === 0) {
        throw new Error(`Batch scoring failed: ${status.counts.errored} errored, ${status.counts.expired} expired`);
      }

      // Retrieve results
      setProgress(56);
      const scores = await retrieveScoringResults(batchId, manifest);
      setProgress(58);
      return scores;
    }

    async function runDetection() {
      let plannerTimer: ReturnType<typeof setInterval> | undefined;
      try {
        // Phase 1: Extract frames from all media files (0-30%)
        setPassIndex(0);
        debugLog(`[Detection] Starting frame extraction for ${state.mediaFiles.length} files (${state.mediaFiles.map(f => f.type).join(", ")})`);
        const frames = await extractFramesFromMultiple(
          state.mediaFiles,
          (pct) => setProgress(pct * 0.3)
        );
        debugLog(`[Detection] Extracted ${frames.length} frames`);

        const batches = buildFrameBatches(frames);
        const sourceFileList = buildSourceFileList(frames);
        const useBatchMode = frames.length >= BATCH_MODE_FRAME_THRESHOLD;
        debugLog(`[Detection] ${frames.length} frames, ${batches.length} batches, batchMode=${useBatchMode} (threshold=${BATCH_MODE_FRAME_THRESHOLD} frames)`);
        if (useBatchMode) {
          batchModeRef.current = true;
          setBatchMode(true);
        }

        let scores: Awaited<ReturnType<typeof scoreSingleBatch>>;

        if (useBatchMode) {
          // ── Batch API scoring (50% cost savings) ──
          debugLog(`[Detection] Starting batch API scoring...`);
          scores = await runBatchScoring(batches, sourceFileList);
        } else {
          // ── Real-time scoring (low latency) ──
          debugLog(`[Detection] Starting real-time scoring...`);
          scores = await runRealtimeScoring(batches, sourceFileList);
        }
        debugLog(`[Detection] Scoring complete — ${scores.length} scores`);

        // Cache frames + scores for fast regeneration
        cacheDetectionData(
          frames, scores,
          mediaFilesRef.current.map((f) => ({ name: f.name, size: f.file?.size }))
        );

        // Phase 3: Plan highlights via server action (60-92%)
        setPassIndex(useBatchMode ? 3 : 2);
        setProgress(60);

        // Slow fallback timer — creeps toward 85% so progress never looks stuck.
        // Phase events will jump ahead when they arrive.
        let phaseReceived = false;
        plannerTimer = setInterval(() => {
          if (phaseReceived) return;
          setProgress((prev) => {
            // Creep toward 85% — slow down as we approach it
            const ceiling = 85;
            const remaining = ceiling - prev;
            const increment = Math.max(0.05, remaining * 0.008);
            return Math.min(prev + increment, ceiling);
          });
        }, 500);

        debugLog(`[Detection] Calling planner SSE — frames=${frames.length}, scores=${scores.length}, photoAnimations=${photoAnimations.length}`);
        // React Strict Mode aborts the signal during its simulated cleanup,
        // but this async function keeps running. Create a fresh controller
        // if the original was killed by Strict Mode (not a real unmount).
        if (abort.signal.aborted) {
          console.warn("[Detection] Abort signal was already aborted (React Strict Mode) — creating fresh controller");
          const fresh = new AbortController();
          abortRef.current = fresh;
          abort = fresh;
        }
        const plannerClientStart = Date.now();
        const result = await callPlannerSSE(
          frames,
          scores,
          state.selectedTemplate?.name,
          undefined,
          state.creativeDirection || undefined,
          (phase) => {
            debugLog(`[Detection] Planner phase: ${phase} (+${((Date.now() - plannerClientStart) / 1000).toFixed(1)}s)`);
            phaseReceived = true;
            clearInterval(plannerTimer);
            if (phase === "thinking") {
              // Model is thinking — jump to 68% and creep slowly
              setProgress((prev) => Math.max(prev, 68));
            } else if (phase === "generating") {
              // Model is outputting text — we're nearly done
              setProgress((prev) => Math.max(prev, 88));
            }
          },
          photoAnimations.length > 0 ? photoAnimations : undefined,
          abort.signal,
          handlePartialField
        );
        debugLog(`[Detection] Planner complete — ${result.clips.length} clips in ${((Date.now() - plannerClientStart) / 1000).toFixed(1)}s`);

        clearInterval(plannerTimer);
        await processResult(result);
      } catch (err) {
        clearInterval(plannerTimer);
        handleError(err);
      }
    }

    async function processResult(result: DetectionResult) {
      setPassIndex(isReplan ? 1 : batchModeRef.current ? 4 : 3);
      setProgress(95);

      // Set the detected theme (template override takes priority)
      const theme = state.selectedTemplate
        ? templateToTheme(state.selectedTemplate.id)
        : result.detectedTheme;
      dispatch({ type: "SET_THEME", theme });

      // Store the AI's content understanding
      if (result.contentSummary) {
        dispatch({ type: "SET_CONTENT_SUMMARY", summary: result.contentSummary });
      }

      // Validate AI output — filter out clips with invalid time ranges
      // Use mediaFilesRef.current to avoid stale closure on state.mediaFiles
      const currentMediaFiles = mediaFilesRef.current;
      const detectedClips = result.clips.filter((c) => {
        if (c.startTime >= c.endTime) {
          console.warn(`Dropping clip: startTime (${c.startTime}) >= endTime (${c.endTime})`);
          return false;
        }
        const media = currentMediaFiles.find((m) => m.id === c.sourceFileId);
        if (media && media.duration > 0 && c.endTime > media.duration + 1) {
          console.warn(`Clip endTime (${c.endTime}s) exceeds source "${media.name}" duration (${media.duration}s)`);
        }
        return true;
      });

      // Build mapping from original (pre-filter) clip index to post-filter index
      // so SFX/voiceover clipIndex values can be remapped correctly
      const clipIndexMap = new Map<number, number>();
      {
        let postIdx = 0;
        for (let origIdx = 0; origIdx < result.clips.length; origIdx++) {
          if (detectedClips.includes(result.clips[origIdx])) {
            clipIndexMap.set(origIdx, postIdx++);
          }
        }
      }

      // Convert to app types
      const highlights = buildHighlights(detectedClips);
      const clips = buildClips(detectedClips, state.selectedTemplate);

      // Animate any photos that the user marked or that Opus gave an animationPrompt
      const animatableSourceIds = new Set(
        currentMediaFiles.filter((f) => f.type === "photo" && f.animatePhoto).map((f) => f.id)
      );
      const animatableClips = detectedClips.filter(
        (c) => c.animationPrompt || animatableSourceIds.has(c.sourceFileId)
      );

      // ══════════════════════════════════════════════════════════
      // AI PRODUCTION PIPELINE — all generators run in parallel
      // ══════════════════════════════════════════════════════════
      const productionPlan = result.productionPlan;

      // Build remapped SFX/voiceover/thumbnail with post-filter clip indices
      // so generation dispatches use correct indices throughout
      const remappedSfx = productionPlan?.sfx
        .filter((s) => clipIndexMap.has(s.clipIndex))
        .map((s) => ({ ...s, clipIndex: clipIndexMap.get(s.clipIndex)! })) ?? [];
      const remappedVoSegments = productionPlan?.voiceover?.segments
        .filter((s) => clipIndexMap.has(s.clipIndex))
        .map((s) => ({ ...s, clipIndex: clipIndexMap.get(s.clipIndex)! })) ?? [];
      const remappedThumbnail = productionPlan?.thumbnail
        ? (clipIndexMap.has(productionPlan.thumbnail.sourceClipIndex)
            ? { ...productionPlan.thumbnail, sourceClipIndex: clipIndexMap.get(productionPlan.thumbnail.sourceClipIndex)! }
            : null)
        : null;

      // Store the production plan in state
      if (productionPlan) {
        dispatch({
          type: "SET_AI_PRODUCTION_PLAN",
          plan: {
            intro: productionPlan.intro,
            outro: productionPlan.outro,
            sfx: remappedSfx.map((s) => ({
                clipIndex: s.clipIndex,
                timing: s.timing as "before" | "on" | "after",
                prompt: s.prompt,
                durationMs: s.durationMs,
              })),
            voiceover: {
              ...productionPlan.voiceover,
              segments: remappedVoSegments,
              delaySec: productionPlan.voiceover.delaySec ?? 0.3,
            },
            musicPrompt: productionPlan.musicPrompt,
            musicDurationMs: productionPlan.musicDurationMs,
            musicVolume: productionPlan.musicVolume ?? 0.5,
            sfxVolume: productionPlan.sfxVolume ?? 0.8,
            voiceoverVolume: productionPlan.voiceoverVolume ?? 1.0,
            defaultTransitionDuration: productionPlan.defaultTransitionDuration ?? 0.3,
            photoDisplayDuration: productionPlan.photoDisplayDuration ?? 3,
            loopCrossfadeDuration: productionPlan.loopCrossfadeDuration ?? 0.5,
            captionEntranceDuration: productionPlan.captionEntranceDuration ?? 0.5,
            captionExitDuration: productionPlan.captionExitDuration ?? 0.3,
            musicDuckRatio: productionPlan.musicDuckRatio ?? 0.3,
            musicDuckAttack: productionPlan.musicDuckAttack,
            musicDuckRelease: productionPlan.musicDuckRelease,
            musicFadeInDuration: productionPlan.musicFadeInDuration,
            musicFadeOutDuration: productionPlan.musicFadeOutDuration,
            beatSyncToleranceMs: productionPlan.beatSyncToleranceMs ?? 50,
            exportBitrate: productionPlan.exportBitrate ?? 12_000_000,
            watermarkOpacity: productionPlan.watermarkOpacity ?? 0.4,
            neonColors: productionPlan.neonColors ?? ["#9333ea", "#06b6d4", "#ec4899", "#f59e0b"],
            beatPulseIntensity: productionPlan.beatPulseIntensity,
            beatFlashOpacity: productionPlan.beatFlashOpacity,
            captionFontSize: productionPlan.captionFontSize,
            captionVerticalPosition: productionPlan.captionVerticalPosition,
            captionShadowColor: productionPlan.captionShadowColor,
            captionShadowBlur: productionPlan.captionShadowBlur,
            flashOverlayAlpha: productionPlan.flashOverlayAlpha,
            zoomPunchFlashAlpha: productionPlan.zoomPunchFlashAlpha,
            colorFlashAlpha: productionPlan.colorFlashAlpha,
            strobeFlashCount: productionPlan.strobeFlashCount,
            strobeFlashAlpha: productionPlan.strobeFlashAlpha,
            lightLeakColor: productionPlan.lightLeakColor,
            glitchColors: productionPlan.glitchColors,
            grainOpacity: productionPlan.grainOpacity,
            vignetteIntensity: productionPlan.vignetteIntensity,
            vignetteTightness: productionPlan.vignetteTightness,
            captionAppearDelay: productionPlan.captionAppearDelay,
            exitDecelSpeed: productionPlan.exitDecelSpeed,
            exitDecelDuration: productionPlan.exitDecelDuration,
            settleScale: productionPlan.settleScale,
            settleDuration: productionPlan.settleDuration,
            clipAudioVolume: productionPlan.clipAudioVolume,
            finalClipWarmth: productionPlan.finalClipWarmth,
            filmStock: productionPlan.filmStock,
            audioBreaths: productionPlan.audioBreaths,
            beatFlashThreshold: productionPlan.beatFlashThreshold,
            vignetteHardness: productionPlan.vignetteHardness,
            watermarkFontSize: productionPlan.watermarkFontSize,
            watermarkYOffset: productionPlan.watermarkYOffset,
            settleEasing: productionPlan.settleEasing,
            exitDecelEasing: productionPlan.exitDecelEasing,
            defaultEntryPunchScale: productionPlan.defaultEntryPunchScale,
            defaultEntryPunchDuration: productionPlan.defaultEntryPunchDuration,
            defaultKenBurnsIntensity: productionPlan.defaultKenBurnsIntensity,
            thumbnail: remappedThumbnail,
            photoAnimationPrompts: Object.fromEntries(
              detectedClips.filter((c) => c.animationPrompt).map((c) => [c.sourceFileId, c.animationPrompt!])
            ),
            styleTransfer: productionPlan.styleTransfer ?? null,
            talkingHeadSpeech: productionPlan.talkingHeadSpeech ?? null,
          },
        });
      }

      // 1. Music — use early-started promise if available (Arch #4), otherwise start now
      // Returns the audio URL so downstream promises (stems) can use it without stale state
      const musicPromise: Promise<string | null> | null = earlyMusicPromiseRef.current
        ? earlyMusicPromiseRef.current
        : (state.aiMusicEnabled && state.aiMusicStatus !== "completed")
        ? (async (): Promise<string | null> => {
            const prompt = productionPlan?.musicPrompt
              || state.aiMusicPrompt?.trim()
              || `Instrumental background music for a ${theme || "cinematic"} highlight reel. ${result.contentSummary ?? ""}`.trim();
            if (!prompt) return null;

            // Check asset cache first
            const musicCacheKey = cacheKey("music", { prompt, durationMs: productionPlan?.musicDurationMs });
            const cached = getCachedAsset(musicCacheKey);
            if (cached) {
              debugLog("[Music] Cache hit — skipping ElevenLabs API call");
              dispatch({ type: "SET_AI_MUSIC_RESULT", status: "completed", audioUrl: cached.data });
              return cached.data;
            }

            dispatch({ type: "SET_AI_MUSIC_RESULT", status: "generating" });
            try {
              const res = await fetch("/api/music/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt,
                  durationMs: productionPlan?.musicDurationMs,
                }),
                signal: abort.signal,
              });
              const data = await res.json();
              if (!res.ok || data.status !== "completed" || !data.audioUrl) {
                dispatch({ type: "SET_AI_MUSIC_RESULT", status: "failed" });
                return null;
              }
              setCachedAsset(musicCacheKey, data.audioUrl);
              dispatch({ type: "SET_AI_MUSIC_RESULT", status: "completed", audioUrl: data.audioUrl });
              return data.audioUrl as string;
            } catch (e) {
              console.error("[Music] Generation failed:", e);
              dispatch({ type: "SET_AI_MUSIC_RESULT", status: "failed" });
              return null;
            }
          })()
        : null;

      // 2. SFX generation — skip if already started early (Arch #4)
      const sfxPromise = earlySfxStartedRef.current
        ? null // Already started from streaming partial field
        : (remappedSfx.length > 0)
        ? (async () => {
            dispatch({ type: "SET_SFX_STATUS", status: "generating" });
            dispatch({
              type: "SET_SFX_TRACKS",
              tracks: remappedSfx.map((s) => ({
                clipIndex: s.clipIndex,
                timing: s.timing as "before" | "on" | "after",
                prompt: s.prompt,
                durationMs: s.durationMs,
                status: "generating" as const,
              })),
            });
            try {
              // Limit concurrency to 3 to avoid ElevenLabs rate limits
              const SFX_CONCURRENCY = 3;
              const sfxQueue = [...remappedSfx];
              const processSfxCue = async (sfxCue: typeof sfxQueue[0]) => {
                try {
                  const sfxCacheKey = cacheKey("sfx", { prompt: sfxCue.prompt, durationMs: sfxCue.durationMs });
                  const cachedSfx = getCachedAsset(sfxCacheKey);
                  if (cachedSfx) {
                    dispatch({ type: "UPDATE_SFX_TRACK", clipIndex: sfxCue.clipIndex, audioUrl: cachedSfx.data, status: "completed" });
                    return;
                  }
                  const res = await fetch("/api/sfx", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: sfxCue.prompt, durationMs: sfxCue.durationMs }),
                    signal: abort.signal,
                  });
                  const data = await res.json();
                  if (res.ok && data.status === "completed" && data.audioUrl) {
                    setCachedAsset(sfxCacheKey, data.audioUrl);
                    dispatch({ type: "UPDATE_SFX_TRACK", clipIndex: sfxCue.clipIndex, audioUrl: data.audioUrl, status: "completed" });
                  } else {
                    dispatch({ type: "UPDATE_SFX_TRACK", clipIndex: sfxCue.clipIndex, audioUrl: "", status: "failed" });
                  }
                } catch (e) {
                  console.error(`[SFX] Cue ${sfxCue.clipIndex} failed:`, e);
                  dispatch({ type: "UPDATE_SFX_TRACK", clipIndex: sfxCue.clipIndex, audioUrl: "", status: "failed" });
                }
              };
              // Process in batches of SFX_CONCURRENCY
              for (let i = 0; i < sfxQueue.length; i += SFX_CONCURRENCY) {
                await Promise.all(sfxQueue.slice(i, i + SFX_CONCURRENCY).map(processSfxCue));
              }
              dispatch({ type: "SET_SFX_STATUS", status: "completed" });
            } catch (e) {
              console.error("[SFX] Pipeline failed:", e);
              dispatch({ type: "SET_SFX_STATUS", status: "failed" });
            }
          })()
        : null;

      // Pre-declare voiceClonePromise so voiceover can await it (section 6 assigns it)
      let voiceClonePromise: Promise<string | null> | null = null;
      if (state.voiceSampleUrl && productionPlan?.voiceover?.enabled) {
        // Start voice cloning early so voiceover can use the result
        voiceClonePromise = (async (): Promise<string | null> => {
          dispatch({ type: "SET_CLONED_VOICE", voiceId: null, status: "generating" });
          try {
            const parts = state.voiceSampleUrl!.split(",");
            const b64 = parts.length > 1 ? parts.slice(1).join(",") : parts[0];
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: "audio/mpeg" });
            const formData = new FormData();
            formData.append("audio", blob, "voice-sample.mp3");
            formData.append("name", "Highlight Tape Voice");
            const res = await fetch("/api/voice-clone", {
              method: "POST",
              body: formData,
              signal: abort.signal,
            });
            const data = await res.json();
            if (res.ok && data.status === "completed" && data.voiceId) {
              dispatch({ type: "SET_CLONED_VOICE", voiceId: data.voiceId, status: "completed" });
              return data.voiceId as string;
            }
            dispatch({ type: "SET_CLONED_VOICE", voiceId: null, status: "failed" });
            return null;
          } catch (e) {
            console.error("[VoiceClone] Cloning failed:", e);
            dispatch({ type: "SET_CLONED_VOICE", voiceId: null, status: "failed" });
            return null;
          }
        })();
      }

      // 3. Voiceover generation — sequential for voice consistency
      // If user provided a voice sample, await clone completion and use cloned voice
      const voiceoverPromise = (productionPlan?.voiceover?.enabled && remappedVoSegments.length > 0)
        ? (async () => {
            const vo = productionPlan!.voiceover;
            // Prefer cloned voice over AI-picked voiceCharacter
            const resolvedVoiceId = voiceClonePromise ? await voiceClonePromise : null;
            dispatch({ type: "SET_VOICEOVER_STATUS", status: "generating" });
            dispatch({
              type: "SET_VOICEOVER_SEGMENTS",
              segments: remappedVoSegments.map((s) => ({
                clipIndex: s.clipIndex,
                text: s.text,
                duration: 0,
                delaySec: s.delaySec,
                status: "generating" as const,
              })),
            });
            try {
              for (const segment of remappedVoSegments) {
                try {
                  // Check voiceover cache first
                  const voCacheKey = cacheKey("vo", { text: segment.text, voice: vo.voiceCharacter });
                  const cachedVo = getCachedAsset(voCacheKey);
                  if (cachedVo) {
                    dispatch({
                      type: "UPDATE_VOICEOVER_SEGMENT",
                      clipIndex: segment.clipIndex,
                      audioUrl: cachedVo.data,
                      duration: (cachedVo.meta?.duration as number) ?? 2,
                      status: "completed",
                    });
                    continue;
                  }

                  const res = await fetch("/api/voiceover", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      text: segment.text,
                      voiceCharacter: vo.voiceCharacter,
                      ...(resolvedVoiceId ? { voiceId: resolvedVoiceId } : {}),
                    }),
                    signal: abort.signal,
                  });
                  const data = await res.json();
                  if (res.ok && data.status === "completed" && data.audioUrl) {
                    setCachedAsset(voCacheKey, data.audioUrl, { duration: data.duration });
                    dispatch({
                      type: "UPDATE_VOICEOVER_SEGMENT",
                      clipIndex: segment.clipIndex,
                      audioUrl: data.audioUrl,
                      duration: data.duration ?? 2,
                      status: "completed",
                    });
                  } else {
                    dispatch({
                      type: "UPDATE_VOICEOVER_SEGMENT",
                      clipIndex: segment.clipIndex,
                      audioUrl: "",
                      duration: 0,
                      status: "failed",
                    });
                  }
                } catch (e) {
                  console.error(`[Voiceover] Segment ${segment.clipIndex} failed:`, e);
                  dispatch({
                    type: "UPDATE_VOICEOVER_SEGMENT",
                    clipIndex: segment.clipIndex,
                    audioUrl: "",
                    duration: 0,
                    status: "failed",
                  });
                }
              }
              dispatch({ type: "SET_VOICEOVER_STATUS", status: "completed" });
            } catch (e) {
              console.error("[Voiceover] Pipeline failed:", e);
              dispatch({ type: "SET_VOICEOVER_STATUS", status: "failed" });
            }
          })()
        : null;

      // 4. Intro card generation (Atlas Cloud T2V)
      const introPromise = productionPlan?.intro
        ? (async () => {
            const rawIntroDur = productionPlan.intro!.duration;
            const introDur = (typeof rawIntroDur === "number" && Number.isFinite(rawIntroDur) && rawIntroDur > 0) ? rawIntroDur : 4;
            debugLog(`[Intro] Generating intro card (${introDur}s)...`);
            dispatch({
              type: "SET_INTRO_CARD",
              card: { text: productionPlan.intro!.text, stylePrompt: productionPlan.intro!.stylePrompt, duration: introDur, status: "generating" },
            });
            try {
              const submitRes = await fetch("/api/intro", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: productionPlan.intro!.stylePrompt, duration: introDur }),
                signal: abort.signal,
              });
              const submitData = await submitRes.json();
              if (!submitRes.ok || !submitData.predictionId) {
                console.error("[Intro] Submit failed:", submitData.error ?? submitRes.status);
                dispatch({
                  type: "SET_INTRO_CARD",
                  card: { text: productionPlan.intro!.text, stylePrompt: productionPlan.intro!.stylePrompt, duration: introDur, status: "failed" },
                });
                return;
              }
              debugLog(`[Intro] Submitted, polling prediction ${submitData.predictionId}...`);
              // Poll using the same animate/check endpoint (Atlas Cloud uses same prediction API)
              const videoUrl = await pollAtlasTask(submitData.predictionId);
              debugLog(`[Intro] ${videoUrl ? "Completed" : "Failed"} — videoUrl=${videoUrl ? videoUrl.slice(0, 60) + "..." : "none"}`);
              dispatch({
                type: "SET_INTRO_CARD",
                card: {
                  text: productionPlan.intro!.text,
                  stylePrompt: productionPlan.intro!.stylePrompt,
                  duration: introDur,
                  videoUrl,
                  status: videoUrl ? "completed" : "failed",
                },
              });
            } catch (e) {
              console.error("[Intro] Card generation failed:", e);
              dispatch({
                type: "SET_INTRO_CARD",
                card: { text: productionPlan.intro!.text, stylePrompt: productionPlan.intro!.stylePrompt, duration: introDur, status: "failed" },
              });
            }
          })()
        : null;

      // 5. Outro card generation (Atlas Cloud T2V)
      const outroPromise = productionPlan?.outro
        ? (async () => {
            const rawOutroDur = productionPlan.outro!.duration;
            const outroDur = (typeof rawOutroDur === "number" && Number.isFinite(rawOutroDur) && rawOutroDur > 0) ? rawOutroDur : 4;
            debugLog(`[Outro] Generating outro card (${outroDur}s)...`);
            dispatch({
              type: "SET_OUTRO_CARD",
              card: { text: productionPlan.outro!.text, stylePrompt: productionPlan.outro!.stylePrompt, duration: outroDur, status: "generating" },
            });
            try {
              const submitRes = await fetch("/api/outro", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: productionPlan.outro!.stylePrompt, duration: outroDur }),
                signal: abort.signal,
              });
              const submitData = await submitRes.json();
              if (!submitRes.ok || !submitData.predictionId) {
                console.error("[Outro] Submit failed:", submitData.error ?? submitRes.status);
                dispatch({
                  type: "SET_OUTRO_CARD",
                  card: { text: productionPlan.outro!.text, stylePrompt: productionPlan.outro!.stylePrompt, duration: outroDur, status: "failed" },
                });
                return;
              }
              debugLog(`[Outro] Submitted, polling prediction ${submitData.predictionId}...`);
              const videoUrl = await pollAtlasTask(submitData.predictionId);
              debugLog(`[Outro] ${videoUrl ? "Completed" : "Failed"} — videoUrl=${videoUrl ? videoUrl.slice(0, 60) + "..." : "none"}`);
              dispatch({
                type: "SET_OUTRO_CARD",
                card: {
                  text: productionPlan.outro!.text,
                  stylePrompt: productionPlan.outro!.stylePrompt,
                  duration: outroDur,
                  videoUrl,
                  status: videoUrl ? "completed" : "failed",
                },
              });
            } catch (e) {
              console.error("[Outro] Card generation failed:", e);
              dispatch({
                type: "SET_OUTRO_CARD",
                card: { text: productionPlan.outro!.text, stylePrompt: productionPlan.outro!.stylePrompt, duration: outroDur, status: "failed" },
              });
            }
          })()
        : null;

      // 6. Voice cloning — already started above (before voiceover, so it can await the result)

      // 7. Stem separation — isolate instrumental from AI music for smarter ducking
      // Uses musicPromise's returned URL directly (not stale state)
      const stemPromise = (state.aiMusicEnabled && productionPlan?.voiceover?.enabled)
        ? (async () => {
            // Wait for music and capture its URL directly from the promise result
            const musicUrl = musicPromise ? await musicPromise : state.aiMusicUrl;
            if (!musicUrl) return; // Music didn't complete — can't separate stems
            dispatch({ type: "SET_INSTRUMENTAL_MUSIC", url: null, status: "generating" });
            try {
              const res = await fetch("/api/stems", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ musicDataUri: musicUrl }),
                signal: abort.signal,
              });
              const data = await res.json();
              if (res.ok && data.status === "completed" && data.instrumentalUrl) {
                dispatch({ type: "SET_INSTRUMENTAL_MUSIC", url: data.instrumentalUrl, status: "completed" });
              } else {
                dispatch({ type: "SET_INSTRUMENTAL_MUSIC", url: null, status: "failed" });
              }
            } catch (e) {
              console.error("[Stems] Stem separation failed:", e);
              dispatch({ type: "SET_INSTRUMENTAL_MUSIC", url: null, status: "failed" });
            }
          })()
        : null;

      // 8. Talking head intro — if voice clone sample exists and Claude wrote speech
      const talkingHeadPromise = (state.voiceSampleUrl && productionPlan?.talkingHeadSpeech)
        ? (async () => {
            dispatch({
              type: "SET_TALKING_HEAD",
              talkingHead: {
                photoUrl: null,
                speechText: productionPlan.talkingHeadSpeech,
                videoUrl: null,
                status: "generating",
              },
            });
            try {
              // Wait for voice clone to complete and get the voiceId directly
              // (state.clonedVoiceId would be stale — captured at useEffect fire time)
              const clonedVoiceId = voiceClonePromise ? await voiceClonePromise : null;

              // Find a photo to use as the talking head source (first uploaded photo)
              const photoMedia = mediaFilesRef.current.find((m) => m.type === "photo");
              if (!photoMedia) {
                dispatch({
                  type: "SET_TALKING_HEAD",
                  talkingHead: { photoUrl: null, speechText: productionPlan.talkingHeadSpeech, videoUrl: null, status: "failed" },
                });
                return;
              }

              // Generate TTS for the speech (using cloned voice if available)
              const voiceId = clonedVoiceId;
              const ttsRes = await fetch("/api/voiceover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: productionPlan.talkingHeadSpeech,
                  voiceCharacter: voiceId ? undefined : "male-broadcaster-hype",
                  voiceId,
                }),
                signal: abort.signal,
              });
              const ttsData = await ttsRes.json();
              if (!ttsRes.ok || ttsData.status !== "completed" || !ttsData.audioUrl) {
                dispatch({
                  type: "SET_TALKING_HEAD",
                  talkingHead: { photoUrl: photoMedia.url, speechText: productionPlan.talkingHeadSpeech, videoUrl: null, status: "failed" },
                });
                return;
              }

              // Convert photo to data URI
              const photoDataUri = await fileToDataUri(photoMedia.file);

              // Submit lip sync task
              const lipRes = await fetch("/api/talking-head", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: abort.signal,
                body: JSON.stringify({
                  imageData: photoDataUri,
                  audioData: ttsData.audioUrl,
                  duration: Math.min(10, ttsData.duration ?? 5),
                }),
              });
              const lipData = await lipRes.json();
              if (!lipRes.ok || !lipData.predictionId) {
                dispatch({
                  type: "SET_TALKING_HEAD",
                  talkingHead: { photoUrl: photoMedia.url, speechText: productionPlan.talkingHeadSpeech, videoUrl: null, status: "failed" },
                });
                return;
              }

              // Poll for lip sync completion
              const videoUrl = await pollAtlasTask(lipData.predictionId);
              dispatch({
                type: "SET_TALKING_HEAD",
                talkingHead: {
                  photoUrl: photoMedia.url,
                  speechText: productionPlan.talkingHeadSpeech,
                  videoUrl: videoUrl || null,
                  status: videoUrl ? "completed" : "failed",
                },
              });
            } catch (e) {
              console.error("[TalkingHead] Pipeline failed:", e);
              dispatch({
                type: "SET_TALKING_HEAD",
                talkingHead: { photoUrl: null, speechText: productionPlan.talkingHeadSpeech, videoUrl: null, status: "failed" },
              });
            }
          })()
        : null;

      // 9. Auto-upscale low-res photos before animation
      // Map of mediaId → upscaled URL, shared with animation pipeline
      const upscaledUrls = new Map<string, string>();
      const upscalePromises = currentMediaFiles
        .filter((m) => m.type === "photo" && m.animatePhoto)
        .map(async (media) => {
          try {
            // Photos under ~500KB are likely low-res — auto-upscale before animation
            if (media.file.size < 500_000) {
              const dataUri = await fileToDataUri(media.file);
              const res = await fetch("/api/upscale", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageData: dataUri }),
                signal: abort.signal,
              });
              const data = await res.json();
              if (res.ok && data.predictionId) {
                const upscaledUrl = await pollAtlasTask(data.predictionId);
                if (upscaledUrl) {
                  upscaledUrls.set(media.id, upscaledUrl);
                  debugLog(`[auto-upscale] Upscaled ${media.name}`);
                }
              }
            }
          } catch (e) {
            console.error("[Upscale] Auto-upscale failed (non-blocking):", e);
          }
        });

      // Wait for upscales to finish before animations so animations can use upscaled images
      await Promise.allSettled(upscalePromises);

      // 10. Store style transfer prompt if Claude chose one
      if (productionPlan?.styleTransfer) {
        dispatch({ type: "SET_STYLE_TRANSFER_PROMPT", prompt: productionPlan.styleTransfer.prompt });
      }

      // 11. Photo animations (existing — already built)
      if (animatableClips.length > 0) {
        setProgress(92);
        const uniquePhotoCount = new Set(
          animatableClips.filter((c) => currentMediaFiles.find((m) => m.id === c.sourceFileId)?.type === "photo").map((c) => c.sourceFileId)
        ).size;
        setAnimationProgress({ total: uniquePhotoCount, completed: 0, failed: 0 });
        setAnimatingPhotos(true);
        await triggerPhotoAnimations(animatableClips, upscaledUrls);
        setAnimatingPhotos(false);
      }

      // Wait for all parallel generators to complete (non-blocking — failures are OK)
      await Promise.allSettled(
        [musicPromise, sfxPromise, voiceoverPromise, introPromise, outroPromise,
         voiceClonePromise, stemPromise, talkingHeadPromise].filter(Boolean)
      );

      const finalHighlights = highlights;
      const finalClips = clips;

      setProgress(100);

      // Brief pause for the 100% satisfaction, then navigate
      setTimeout(() => {
        if (abort.signal.aborted) return;
        dispatch({ type: "SET_HIGHLIGHTS", highlights: finalHighlights });
        dispatch({ type: "SET_CLIPS", clips: finalClips });
        dispatch({ type: "SET_STEP", step: "results" });
      }, 400);
    }

    /** Poll an Atlas Cloud task via batched poll manager. Returns output URL or empty string on failure. */
    async function pollAtlasTask(predictionId: string): Promise<string> {
      try {
        return await pollBatched(predictionId, { timeoutMs: 300_000 });
      } catch (e) {
        console.error(`[Atlas] Poll failed for prediction ${predictionId}:`, e);
        return ""; // Failed or timed out
      }
    }

    /** Convert a File to a base64 data URI for server-side API calls. */
    function fileToDataUri(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    }

    /** Poll for animation completion via batched poll manager. */
    async function pollAnimationOnClient(predictionId: string, mediaId: string, mediaName: string) {
      try {
        const videoUrl = await pollBatched(predictionId, { timeoutMs: 300_000, maxErrors: 3 });
        dispatch({
          type: "SET_ANIMATION_RESULT",
          fileId: mediaId,
          animatedVideoUrl: videoUrl,
          animationStatus: "completed",
        });
      } catch (err) {
        const signal = animationAbortRef.current?.signal;
        if (signal?.aborted) return;
        console.error(`Photo animation failed for "${mediaName}":`, err);
        dispatch({
          type: "SET_ANIMATION_RESULT",
          fileId: mediaId,
          animatedVideoUrl: null,
          animationStatus: "failed",
        });
      }
    }

    /** Fire Kling animation calls in parallel — results update MediaFile state as they complete. */
    function triggerPhotoAnimations(clips: DetectedClip[], upscaledUrls?: Map<string, string>): Promise<void> {
      // Create a fresh AbortController for animations — the main `abort` controller
      // is already dead (fired by React Strict Mode's simulated unmount in dev).
      // This one is created lazily, long after Strict Mode cleanup, so it's alive.
      animationAbortRef.current = new AbortController();
      const animSignal = animationAbortRef.current.signal;

      // Deduplicate by sourceFileId (one animation per photo, not per clip)
      const seen = new Set<string>();
      const uniqueClips = clips.filter((c) => {
        if (seen.has(c.sourceFileId)) return false;
        seen.add(c.sourceFileId);
        return true;
      });

      // Track completions — progress goes from 92% to 99% as animations finish
      // Use ref to avoid stale closure on state.mediaFiles
      const latestMediaFiles = mediaFilesRef.current;
      let completedAnimations = 0;
      const totalAnimations = uniqueClips.filter((c) => {
        const m = latestMediaFiles.find((f) => f.id === c.sourceFileId);
        return m && m.type === "photo";
      }).length;

      if (totalAnimations === 0) {
        console.warn("[Detection] triggerPhotoAnimations: no photo clips to animate, skipping");
        return Promise.resolve();
      }
      debugLog(`[Detection] Animating ${totalAnimations} photos...`);

      const promises: Promise<void>[] = [];

      for (const clip of uniqueClips) {
        const media = latestMediaFiles.find((m) => m.id === clip.sourceFileId);
        if (!media || media.type !== "photo") continue;

        // Determine the animation prompt:
        // 1. Use Opus-generated animationPrompt if available
        // 2. Fall back to user's animationInstructions
        // 3. Fall back to a generic prompt based on the clip label
        const prompt = clip.animationPrompt
          || media.animationInstructions
          || `Bring this photo to life with natural realistic motion. Subjects move naturally, environment has ambient motion. Scene: ${clip.label}`;

        // Mark as generating
        dispatch({
          type: "SET_ANIMATION_RESULT",
          fileId: media.id,
          animatedVideoUrl: null,
          animationStatus: "generating",
        });

        // Submit task — use upscaled image if available, otherwise original
        const imagePromise = upscaledUrls?.get(media.id)
          ? Promise.resolve(upscaledUrls.get(media.id)!)
          : fileToDataUri(media.file);
        const p = imagePromise
          .then(async (dataUri) => {
            const res = await fetch("/api/animate/submit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageData: dataUri, prompt, duration: 5 }),
              signal: animSignal,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Submit failed");
            return data.predictionId as string;
          })
          .then((predictionId) => pollAnimationOnClient(predictionId, media.id, media.name))
          .then(() => {
            completedAnimations++;
            setAnimationProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
            // Progress 92% → 99% as animations complete
            const pct = totalAnimations > 0 ? Math.round(92 + (completedAnimations / totalAnimations) * 7) : 99;
            setProgress(pct);
          })
          .catch((err) => {
            if (animSignal.aborted) return;
            completedAnimations++;
            setAnimationProgress((prev) => ({ ...prev, completed: prev.completed + 1, failed: prev.failed + 1 }));
            const pct = totalAnimations > 0 ? Math.round(92 + (completedAnimations / totalAnimations) * 7) : 99;
            setProgress(pct);
            console.error(`Photo animation failed for "${media.name}":`, err);
            dispatch({
              type: "SET_ANIMATION_RESULT",
              fileId: media.id,
              animatedVideoUrl: null,
              animationStatus: "failed",
            });
          });
        promises.push(p);
      }

      return Promise.all(promises).then(() => {});
    }

    function handleError(err: unknown) {
      if (abort.signal.aborted) return; // unmounted — don't show errors
      const message = err instanceof Error ? err.message : String(err);
      console.error("Detection failed:", message);

      if (message.includes("Failed to fetch") || message.includes("fetch failed") || message.includes("TimeoutError") || message.includes("aborted")) {
        setError("Connection to the AI was lost — the planner may need more time for complex footage. Please try again.");
      } else if (message.includes("ANTHROPIC_API_KEY")) {
        setError("API key not configured. Please set ANTHROPIC_API_KEY in your environment.");
      } else if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
        setError("Rate limit exceeded. Please wait a minute and try again.");
      } else if (message.includes("529") || message.toLowerCase().includes("overload")) {
        setError("AI service is temporarily overloaded. Please try again in a few minutes.");
      } else if (message.includes("401") || message.includes("403")) {
        setError("API authentication failed. Please check your ANTHROPIC_API_KEY.");
      } else if (message.includes("planner failed")) {
        setError("AI couldn't find highlight-worthy moments. Try videos with more action, faces, or variety.");
      } else {
        setError(`Detection failed: ${message.slice(0, 150)}`);
      }
    }
    return cleanupFn;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passes = isReplan ? REPLAN_PASSES : batchMode ? BATCH_DETECTION_PASSES : DETECTION_PASSES;

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 animate-fade-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-red-500/20">
          <Sparkles className="h-9 w-9 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Something went wrong</h2>
        <p className="max-w-sm text-center text-[var(--text-secondary)]">{error}</p>
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: "upload" })}
          className="btn-primary mt-2"
        >
          Go Back &amp; Try Again
        </button>
      </div>
    );
  }

  // Circular progress ring params
  const ringSize = 120;
  const strokeWidth = 6;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 animate-fade-in">
      {/* Circular progress with icon */}
      <div className="relative">
        <svg width={ringSize} height={ringSize} className="rotate-[-90deg]">
          <circle
            cx={ringSize / 2} cy={ringSize / 2} r={radius}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth}
          />
          <circle
            cx={ringSize / 2} cy={ringSize / 2} r={radius}
            fill="none" stroke="url(#progress-gradient)" strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            className="transition-all duration-500 ease-out"
          />
          <defs>
            <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--accent-pink)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-pulse-glow flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-gradient">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
        </div>
      </div>

      {/* Percentage */}
      <p className="text-2xl font-bold text-white tabular-nums">
        {Math.round(progress)}%
      </p>

      {/* Linear progress bar (secondary) */}
      <div className="w-full max-w-xs">
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-accent-gradient transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Phase label */}
      <div className="text-center space-y-1.5">
        <p className="text-sm font-medium text-white">
          {animatingPhotos
                ? animationProgress.total > 1
                  ? `Animating photos (${animationProgress.completed}/${animationProgress.total})`
                  : "Animating your photo"
                : plannerElapsed > 0
                  ? `Planning your highlight tape`
                  : (passes[passIndex] ?? passes[passes.length - 1]).replace("...", "")}
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">
          {animatingPhotos
                ? animationProgress.failed > 0
                  ? `${animationProgress.failed} failed — check your ATLASCLOUD_API_KEY configuration`
                  : "Generating motion with Kling — usually 1-2 min per photo"
                : isPlannerPass
                  ? `Analyzing ${fileCount} file${fileCount !== 1 ? "s" : ""} · ${plannerElapsed}s elapsed`
                  : isReplan
                    ? "Re-generating with your creative direction"
                    : `${fileCount} file${fileCount !== 1 ? "s" : ""} queued for analysis`}
        </p>
      </div>

      {/* Pipeline phases checklist — shows completed phases */}
      <div className="flex flex-col gap-1 w-full max-w-xs">
        {passes.map((label, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-all duration-300 ${
              i < passIndex
                ? "text-emerald-400/80"
                : i === passIndex
                  ? "text-white bg-white/5"
                  : "text-[var(--text-tertiary)]"
            }`}
          >
            <div className={`h-1.5 w-1.5 rounded-full transition-colors ${
              i < passIndex
                ? "bg-emerald-400"
                : i === passIndex
                  ? "bg-[var(--accent)] animate-pulse"
                  : "bg-white/20"
            }`} />
            {label.replace("...", "")}
          </div>
        ))}
      </div>

      {isSlow && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 max-w-sm animate-fade-in">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <p className="text-xs text-amber-400/80">
            {isPlannerPass
              ? isVerySlow
                ? "Complex footage takes longer. You can wait or go back."
                : "AI needs extra time for your footage..."
              : isVerySlow
                ? "Model may be overloaded. You can wait or go back."
                : "Taking longer than expected — still working..."}
          </p>
        </div>
      )}
    </div>
  );
}
