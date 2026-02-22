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
} from "@/actions/detect";
import { buildFrameBatches, buildSourceFileList } from "@/lib/frame-batching";
import { templateToTheme } from "@/lib/editing-styles";
import { ALL_VELOCITY_PRESETS, type VelocityPreset } from "@/lib/velocity";
import { uuid } from "@/lib/utils";
import { cacheDetectionData, getCachedDetectionData } from "@/lib/detection-cache";

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

/** Minimum batch count before Batch API mode kicks in (saves 50% on scoring cost). */
const BATCH_MODE_THRESHOLD = 5;
/** Polling interval for Batch API status checks. */
const BATCH_POLL_INTERVAL_MS = 5_000;

const REPLAN_PASSES = [
  "Re-planning with your direction...",
  "Applying editing style for best flow...",
];

/** Threshold in seconds before showing "taking longer than expected". */
const SLOW_THRESHOLD_S = 45;

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
  onPhase?: (phase: "thinking" | "generating") => void
): Promise<DetectionResult> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frames, scores, templateName, userFeedback }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Planner request failed (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse complete SSE events (separated by double newlines)
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
  }

  throw new Error("Planner stream ended without a result");
}

export default function DetectingStep() {
  const { state, dispatch } = useApp();
  const [progress, setProgress] = useState(0);
  const [passIndex, setPassIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSlow, setIsSlow] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const batchModeRef = useRef(false);
  const hasStarted = useRef(false);
  const phaseStartRef = useRef(Date.now());
  const slowTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fileCount = state.mediaFiles.length;
  const isReplan = !!state.regenerateFeedback;

  // Reset the slow timer whenever the pass/phase changes
  useEffect(() => {
    setIsSlow(false);
    phaseStartRef.current = Date.now();
    clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_S * 1000);
    return () => clearTimeout(slowTimerRef.current);
  }, [passIndex]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

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

        // Slow fallback timer — only creeps if no phase events arrive
        const plannerTimer = setInterval(() => {
          setProgress((prev) => {
            const remaining = 50 - prev;
            const increment = Math.max(0.05, remaining * 0.01);
            return Math.min(prev + increment, 50);
          });
        }, 500);

        const result = await callPlannerSSE(
          cached.frames,
          cached.scores,
          state.selectedTemplate?.name,
          state.regenerateFeedback ?? undefined,
          (phase) => {
            clearInterval(plannerTimer);
            if (phase === "thinking") {
              setProgress((prev) => Math.max(prev, 45));
            } else if (phase === "generating") {
              setProgress(82);
            }
          }
        );

        clearInterval(plannerTimer);

        // Clear feedback so we don't re-trigger on next mount
        dispatch({ type: "SET_REGENERATE_FEEDBACK", feedback: null });

        processResult(result);
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
        const frames = await extractFramesFromMultiple(
          state.mediaFiles,
          (pct) => setProgress(pct * 0.3)
        );

        const batches = buildFrameBatches(frames);
        const sourceFileList = buildSourceFileList(frames);
        const useBatchMode = batches.length >= BATCH_MODE_THRESHOLD;
        if (useBatchMode) {
          batchModeRef.current = true;
          setBatchMode(true);
        }

        let scores: Awaited<ReturnType<typeof scoreSingleBatch>>;

        if (useBatchMode) {
          // ── Batch API scoring (50% cost savings) ──
          scores = await runBatchScoring(batches, sourceFileList);
        } else {
          // ── Real-time scoring (low latency) ──
          scores = await runRealtimeScoring(batches, sourceFileList);
        }

        // Cache frames + scores for fast regeneration
        cacheDetectionData(frames, scores);

        // Phase 3: Plan highlights via server action (60-92%)
        setPassIndex(useBatchMode ? 3 : 2);
        setProgress(60);

        // Slow fallback timer — only creeps if no phase events arrive
        const plannerTimer = setInterval(() => {
          setProgress((prev) => {
            const remaining = 72 - prev;
            const increment = Math.max(0.05, remaining * 0.01);
            return Math.min(prev + increment, 72);
          });
        }, 500);

        const result = await callPlannerSSE(
          frames,
          scores,
          state.selectedTemplate?.name,
          undefined,
          (phase) => {
            clearInterval(plannerTimer);
            if (phase === "thinking") {
              // Model is thinking — jump to 68% and creep slowly
              setProgress((prev) => Math.max(prev, 68));
            } else if (phase === "generating") {
              // Model is outputting text — we're nearly done
              setProgress(88);
            }
          }
        );

        clearInterval(plannerTimer);
        processResult(result);
      } catch (err) {
        handleError(err);
      }
    }

    function processResult(result: DetectionResult) {
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
      const highlights = detectedClips.map((c) => ({
        id: c.id,
        sourceFileId: c.sourceFileId,
        startTime: c.startTime,
        endTime: c.endTime,
        confidenceScore: c.confidenceScore,
        label: c.label,
        detectionSources: ["Cloud AI"],
      }));

      const clips = detectedClips.map((c, i) => ({
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
        selectedFilter: (c.filter ?? state.selectedTemplate?.suggestedFilter ?? "None") as import("@/lib/types").VideoFilter,
        velocityPreset: ALL_VELOCITY_PRESETS.includes(c.velocityPreset as VelocityPreset)
          ? (c.velocityPreset as VelocityPreset)
          : ("normal" as VelocityPreset),
        transitionType: c.transitionType,
        transitionDuration: c.transitionDuration,
        entryPunchScale: c.entryPunchScale,
        kenBurnsIntensity: c.kenBurnsIntensity,
      }));

      setProgress(100);

      // Brief pause for the 100% satisfaction, then navigate
      setTimeout(() => {
        dispatch({ type: "SET_HIGHLIGHTS", highlights });
        dispatch({ type: "SET_CLIPS", clips });
        dispatch({ type: "SET_STEP", step: "results" });
      }, 400);
    }

    function handleError(err: unknown) {
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
        {passes[passIndex] ?? passes[passes.length - 1]}
      </p>

      <p className="text-center text-xs text-[var(--text-tertiary)]">
        {isReplan
          ? "Re-generating with your creative direction..."
          : `AI is analyzing ${fileCount} file${fileCount !== 1 ? "s" : ""} to create your highlight tape`}
      </p>

      {isSlow && (
        <p className="text-center text-xs text-amber-400/80 animate-fade-in">
          Taking longer than expected — still working, hang tight...
        </p>
      )}
    </div>
  );
}
