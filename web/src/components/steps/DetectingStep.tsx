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
import type { AnimationPollResult } from "@/lib/kling";
import { buildFrameBatches, buildSourceFileList } from "@/lib/frame-batching";
import { templateToTheme } from "@/lib/editing-styles";
import { ALL_VELOCITY_PRESETS, type VelocityPreset } from "@/lib/velocity";
import { uuid } from "@/lib/utils";
import { cacheDetectionData, getCachedDetectionData } from "@/lib/detection-cache";

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
      : ("normal" as VelocityPreset),
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

/** Max time (ms) to wait for the next SSE chunk from the server before aborting. */
const SSE_READ_TIMEOUT_MS = 90_000;

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
  signal?: AbortSignal
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
        return JSON.parse(data) as DetectionResult;
      }
      if (eventType === "error") {
        const { message } = JSON.parse(data);
        throw new Error(message);
      }
      if (eventType === "phase") {
        try {
          const { phase } = JSON.parse(data);
          onPhase?.(phase);
        } catch { /* ignore */ }
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
      timer = setTimeout(() => reject(new Error("Lost connection to server — no data received for 90 seconds. Please try again.")), SSE_READ_TIMEOUT_MS);
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
  const [plannerStatus, setPlannerStatus] = useState<"idle" | "waiting" | "thinking" | "generating">("idle");
  const [plannerElapsed, setPlannerElapsed] = useState(0);
  const plannerTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const [batchMode, setBatchMode] = useState(false);
  const batchModeRef = useRef(false);
  const hasStarted = useRef(false);
  const abortRef = useRef<AbortController>(new AbortController());
  const animationAbortRef = useRef<AbortController | null>(null);
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

  useEffect(() => {
    // Always register cleanup for real unmount — React Strict Mode fires the
    // first cleanup during its simulated unmount, but the second mount still
    // needs a cleanup for when the component ACTUALLY unmounts.
    const cleanupFn = () => {
      abortRef.current.abort("DetectingStep unmounted");
      animationAbortRef.current?.abort("DetectingStep unmounted");
      clearInterval(plannerTimerRef.current);
    };

    if (hasStarted.current) return cleanupFn;
    hasStarted.current = true;
    const abort = abortRef.current;

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
      try {
        const cached = getCachedDetectionData();
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
        const plannerTimer = setInterval(() => {
          if (replanPhaseReceived) return;
          setProgress((prev) => {
            const ceiling = 75;
            const remaining = ceiling - prev;
            const increment = Math.max(0.05, remaining * 0.008);
            return Math.min(prev + increment, ceiling);
          });
        }, 500);

        const replanStart = Date.now();
        setPlannerStatus("waiting");
        setPlannerElapsed(0);
        clearInterval(plannerTimerRef.current);
        plannerTimerRef.current = setInterval(() => {
          setPlannerElapsed(Math.floor((Date.now() - replanStart) / 1000));
        }, 1000);

        const result = await callPlannerSSE(
          cached.frames,
          cached.scores,
          state.selectedTemplate?.name,
          state.regenerateFeedback ?? undefined,
          state.creativeDirection || undefined,
          (phase) => {
            replanPhaseReceived = true;
            clearInterval(plannerTimer);
            setPlannerStatus(phase);
            if (phase === "thinking") {
              setProgress((prev) => Math.max(prev, 45));
            } else if (phase === "generating") {
              setProgress(82);
            }
          },
          photoAnimations.length > 0 ? photoAnimations : undefined,
          abort.signal
        );

        clearInterval(plannerTimer);
        clearInterval(plannerTimerRef.current);
        setPlannerStatus("idle");

        // Clear feedback so we don't re-trigger on next mount
        dispatch({ type: "SET_REGENERATE_FEEDBACK", feedback: null });

        await processResult(result);
      } catch (err) {
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
            setProgress(Math.round(30 + (launchedBatches / batches.length) * 10));
            const scores = await scoreSingleBatch(
              batch,
              sourceFileList,
              state.selectedTemplate?.name
            );
            completedBatches++;
            setProgress(Math.round(40 + (completedBatches / batches.length) * 18));
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
        await new Promise((r) => setTimeout(r, BATCH_POLL_INTERVAL_MS));
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
      try {
        // Phase 1: Extract frames from all media files (0-30%)
        setPassIndex(0);
        console.log(`[Detection] Starting frame extraction for ${state.mediaFiles.length} files (${state.mediaFiles.map(f => f.type).join(", ")})`);
        const frames = await extractFramesFromMultiple(
          state.mediaFiles,
          (pct) => setProgress(pct * 0.3)
        );
        console.log(`[Detection] Extracted ${frames.length} frames`);

        const batches = buildFrameBatches(frames);
        const sourceFileList = buildSourceFileList(frames);
        const useBatchMode = frames.length >= BATCH_MODE_FRAME_THRESHOLD;
        console.log(`[Detection] ${frames.length} frames, ${batches.length} batches, batchMode=${useBatchMode} (threshold=${BATCH_MODE_FRAME_THRESHOLD} frames)`);
        if (useBatchMode) {
          batchModeRef.current = true;
          setBatchMode(true);
        }

        let scores: Awaited<ReturnType<typeof scoreSingleBatch>>;

        if (useBatchMode) {
          // ── Batch API scoring (50% cost savings) ──
          console.log(`[Detection] Starting batch API scoring...`);
          scores = await runBatchScoring(batches, sourceFileList);
        } else {
          // ── Real-time scoring (low latency) ──
          console.log(`[Detection] Starting real-time scoring...`);
          scores = await runRealtimeScoring(batches, sourceFileList);
        }
        console.log(`[Detection] Scoring complete — ${scores.length} scores`);

        // Cache frames + scores for fast regeneration
        cacheDetectionData(frames, scores);

        // Phase 3: Plan highlights via server action (60-92%)
        setPassIndex(useBatchMode ? 3 : 2);
        setProgress(60);

        // Slow fallback timer — creeps toward 85% so progress never looks stuck.
        // Phase events will jump ahead when they arrive.
        let phaseReceived = false;
        const plannerTimer = setInterval(() => {
          if (phaseReceived) return;
          setProgress((prev) => {
            // Creep toward 85% — slow down as we approach it
            const ceiling = 85;
            const remaining = ceiling - prev;
            const increment = Math.max(0.05, remaining * 0.008);
            return Math.min(prev + increment, ceiling);
          });
        }, 500);

        console.log(`[Detection] Calling planner SSE — frames=${frames.length}, scores=${scores.length}, photoAnimations=${photoAnimations.length}`);
        const plannerClientStart = Date.now();
        setPlannerStatus("waiting");
        setPlannerElapsed(0);
        clearInterval(plannerTimerRef.current);
        plannerTimerRef.current = setInterval(() => {
          setPlannerElapsed(Math.floor((Date.now() - plannerClientStart) / 1000));
        }, 1000);

        const result = await callPlannerSSE(
          frames,
          scores,
          state.selectedTemplate?.name,
          undefined,
          state.creativeDirection || undefined,
          (phase) => {
            console.log(`[Detection] Planner phase: ${phase} (+${((Date.now() - plannerClientStart) / 1000).toFixed(1)}s)`);
            phaseReceived = true;
            clearInterval(plannerTimer);
            setPlannerStatus(phase);
            if (phase === "thinking") {
              // Model is thinking — jump to 68% and creep slowly
              setProgress((prev) => Math.max(prev, 68));
            } else if (phase === "generating") {
              // Model is outputting text — we're nearly done
              setProgress(88);
            }
          },
          photoAnimations.length > 0 ? photoAnimations : undefined,
          abort.signal
        );
        console.log(`[Detection] Planner complete — ${result.clips.length} clips in ${((Date.now() - plannerClientStart) / 1000).toFixed(1)}s`);

        clearInterval(plannerTimer);
        clearInterval(plannerTimerRef.current);
        setPlannerStatus("idle");
        await processResult(result);
      } catch (err) {
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
      const detectedClips = result.clips.filter((c) => {
        if (c.startTime >= c.endTime) {
          console.warn(`Dropping clip: startTime (${c.startTime}) >= endTime (${c.endTime})`);
          return false;
        }
        const media = state.mediaFiles.find((m) => m.id === c.sourceFileId);
        if (media && media.duration > 0 && c.endTime > media.duration + 1) {
          console.warn(`Clip endTime (${c.endTime}s) exceeds source "${media.name}" duration (${media.duration}s)`);
        }
        return true;
      });

      // Convert to app types
      const highlights = buildHighlights(detectedClips);
      const clips = buildClips(detectedClips, state.selectedTemplate);

      // Animate any photos that the user marked or that Opus gave an animationPrompt
      const animatableSourceIds = new Set(
        state.mediaFiles.filter((f) => f.type === "photo" && f.animatePhoto).map((f) => f.id)
      );
      const animatableClips = detectedClips.filter(
        (c) => c.animationPrompt || animatableSourceIds.has(c.sourceFileId)
      );

      if (animatableClips.length > 0) {
        // Hold progress at 92% — animation phase takes over
        setProgress(92);
        const uniquePhotoCount = new Set(
          animatableClips.filter((c) => state.mediaFiles.find((m) => m.id === c.sourceFileId)?.type === "photo").map((c) => c.sourceFileId)
        ).size;
        setAnimationProgress({ total: uniquePhotoCount, completed: 0, failed: 0 });
        setAnimatingPhotos(true);
        await triggerPhotoAnimations(animatableClips);
        setAnimatingPhotos(false);
      }

      const finalHighlights = highlights;
      const finalClips = clips;

      setProgress(100);

      // Brief pause for the 100% satisfaction, then navigate
      setTimeout(() => {
        dispatch({ type: "SET_HIGHLIGHTS", highlights: finalHighlights });
        dispatch({ type: "SET_CLIPS", clips: finalClips });
        dispatch({ type: "SET_STEP", step: "results" });
      }, 400);
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

    /** Poll interval for animation status checks (ms) */
    const ANIMATION_POLL_MS = 5_000;
    /** Max animation wait time (ms) */
    const ANIMATION_TIMEOUT_MS = 300_000;
    /** Max consecutive transient errors before giving up */
    const ANIMATION_MAX_TRANSIENT_ERRORS = 3;

    /** Poll for animation completion on the client side (avoids server action timeout). */
    async function pollAnimationOnClient(predictionId: string, mediaId: string, mediaName: string) {
      const deadline = Date.now() + ANIMATION_TIMEOUT_MS;
      let consecutiveErrors = 0;
      const signal = animationAbortRef.current?.signal;

      while (Date.now() < deadline) {
        if (signal?.aborted) return;
        await new Promise((r) => setTimeout(r, ANIMATION_POLL_MS));
        if (signal?.aborted) return;

        try {
          const res = await fetch("/api/animate/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ predictionId }),
            signal: signal,
          });
          if (!res.ok) throw new Error("Check request failed");
          const result: AnimationPollResult = await res.json();
          consecutiveErrors = 0; // reset on success

          if (result.status === "completed" && result.videoUrl) {
            dispatch({
              type: "SET_ANIMATION_RESULT",
              fileId: mediaId,
              animatedVideoUrl: result.videoUrl,
              animationStatus: "completed",
            });
            return;
          }

          if (result.status === "failed") {
            console.error(`Photo animation failed for "${mediaName}": ${result.error}`);
            dispatch({
              type: "SET_ANIMATION_RESULT",
              fileId: mediaId,
              animatedVideoUrl: null,
              animationStatus: "failed",
            });
            return;
          }
          // status === "processing" — keep polling
        } catch (err) {
          if (signal?.aborted) return;
          consecutiveErrors++;
          console.warn(`Photo animation poll error for "${mediaName}" (${consecutiveErrors}/${ANIMATION_MAX_TRANSIENT_ERRORS}):`, err);
          if (consecutiveErrors >= ANIMATION_MAX_TRANSIENT_ERRORS) {
            console.error(`Photo animation gave up after ${ANIMATION_MAX_TRANSIENT_ERRORS} consecutive errors for "${mediaName}"`);
            dispatch({
              type: "SET_ANIMATION_RESULT",
              fileId: mediaId,
              animatedVideoUrl: null,
              animationStatus: "failed",
            });
            return;
          }
          // Transient error — keep polling
        }
      }

      // Timed out
      if (!signal?.aborted) {
        console.error(`Photo animation timed out for "${mediaName}"`);
        dispatch({
          type: "SET_ANIMATION_RESULT",
          fileId: mediaId,
          animatedVideoUrl: null,
          animationStatus: "failed",
        });
      }
    }

    /** Fire Kling animation calls in parallel — results update MediaFile state as they complete. */
    function triggerPhotoAnimations(clips: DetectedClip[]): Promise<void> {
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
      let completedAnimations = 0;
      const totalAnimations = uniqueClips.filter((c) => {
        const m = state.mediaFiles.find((f) => f.id === c.sourceFileId);
        return m && m.type === "photo";
      }).length;

      if (totalAnimations === 0) {
        console.warn("[Detection] triggerPhotoAnimations: no photo clips to animate, skipping");
        return Promise.resolve();
      }
      console.log(`[Detection] Animating ${totalAnimations} photos...`);

      const promises: Promise<void>[] = [];

      for (const clip of uniqueClips) {
        const media = state.mediaFiles.find((m) => m.id === clip.sourceFileId);
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

        // Submit task via API route (avoids React Flight serialization limits for large base64)
        const p = fileToDataUri(media.file)
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
      clearInterval(plannerTimerRef.current);
      setPlannerStatus("idle");
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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 animate-fade-in">
      {/* Animated icon */}
      <div className="relative">
        <div className="animate-pulse-glow flex h-24 w-24 items-center justify-center rounded-3xl bg-accent-gradient">
          <Sparkles className="h-10 w-10 text-white" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-accent-gradient transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 text-center text-lg font-semibold text-white">
          {Math.round(progress)}%
        </p>
      </div>

      {/* Pass label */}
      <p className="text-center text-[var(--text-secondary)]">
        {animatingPhotos
              ? animationProgress.total > 1
                ? `Animating photos (${animationProgress.completed}/${animationProgress.total})...`
                : "Animating your photo..."
              : plannerElapsed > 0
                ? plannerStatus === "thinking"
                  ? `AI is analyzing your footage (${plannerElapsed}s)...`
                  : plannerStatus === "generating"
                    ? `Building your edit plan (${plannerElapsed}s)...`
                    : `Planning your highlight tape (${plannerElapsed}s)...`
                : (passes[passIndex] ?? passes[passes.length - 1])}
      </p>

      <p className="text-center text-xs text-[var(--text-tertiary)]">
        {animatingPhotos
              ? animationProgress.failed > 0
                ? `${animationProgress.failed} failed — check your ATLASCLOUD_API_KEY configuration`
                : "Generating motion with Kling — this usually takes 1-2 minutes per photo"
              : plannerStatus !== "idle"
                ? plannerStatus === "thinking"
                  ? `AI is deeply analyzing your content (${plannerElapsed}s)...`
                  : plannerStatus === "generating"
                    ? `AI is writing the edit plan (${plannerElapsed}s)...`
                    : `Waiting for AI response (${plannerElapsed}s)...`
                : isReplan
                  ? "Re-generating with your creative direction..."
                  : `AI is analyzing ${fileCount} file${fileCount !== 1 ? "s" : ""} to create your highlight tape`}
      </p>

      {isSlow && (
        <p className="text-center text-xs text-amber-400/80 animate-fade-in">
          {plannerStatus !== "idle"
            ? isVerySlow
              ? "The AI planner is still working — complex footage takes longer to analyze. You can wait or go back and try again."
              : "The AI planner needs extra time for your footage — still processing..."
            : isVerySlow
              ? "This is taking unusually long — the AI model may be overloaded. You can wait or go back and try again."
              : "Taking longer than expected — still working, hang tight..."}
        </p>
      )}
    </div>
  );
}
