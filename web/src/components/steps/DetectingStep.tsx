"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { extractFramesFromMultiple } from "@/lib/frame-extractor";
import { scoreSingleBatch, planFromScores } from "@/actions/detect";
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

const REPLAN_PASSES = [
  "Re-planning with your direction...",
  "Applying editing style for best flow...",
];

/** Threshold in seconds before showing "taking longer than expected". */
const SLOW_THRESHOLD_S = 45;

export default function DetectingStep() {
  const { state, dispatch } = useApp();
  const [progress, setProgress] = useState(0);
  const [passIndex, setPassIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSlow, setIsSlow] = useState(false);
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

        const plannerTimer = setInterval(() => {
          setProgress((prev) => {
            const remaining = 88 - prev;
            const increment = Math.max(0.05, remaining * 0.02);
            return Math.min(prev + increment, 88);
          });
        }, 200);

        const result = await planFromScores(
          cached.frames,
          cached.scores,
          state.selectedTemplate?.name,
          state.regenerateFeedback ?? undefined
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

    async function runDetection() {
      try {
        // Phase 1: Extract frames from all media files (0-30%)
        setPassIndex(0);
        const frames = await extractFramesFromMultiple(
          state.mediaFiles,
          (pct) => setProgress(pct * 0.3)
        );

        // Phase 2: Score frames via per-batch server action calls (30-60%)
        // Each batch is a separate server action call (~30s each) to avoid timeout.
        setPassIndex(1);
        setProgress(30);

        const batches = buildFrameBatches(frames);
        const sourceFileList = buildSourceFileList(frames);
        const allScores: Awaited<ReturnType<typeof scoreSingleBatch>> = [];
        const SCORING_CONCURRENCY = 5;
        const STAGGER_MS = 500;
        let scoredBatches = 0;

        // Fire batches concurrently in waves (staggered starts within each wave)
        for (let w = 0; w < batches.length; w += SCORING_CONCURRENCY) {
          const wave = batches.slice(w, w + SCORING_CONCURRENCY);
          const waveResults = await Promise.all(
            wave.map(async (batch, i) => {
              if (i > 0) await new Promise((r) => setTimeout(r, i * STAGGER_MS));
              const scores = await scoreSingleBatch(
                batch,
                sourceFileList,
                state.selectedTemplate?.name
              );
              scoredBatches++;
              setProgress(Math.round(30 + (scoredBatches / batches.length) * 28));
              return scores;
            })
          );
          allScores.push(...waveResults.flat());
        }

        const scores = allScores;

        // Cache frames + scores for fast regeneration
        cacheDetectionData(frames, scores);

        // Phase 3: Plan highlights via server action (60-90%)
        setPassIndex(2);
        setProgress(60);

        const plannerTimer = setInterval(() => {
          setProgress((prev) => {
            const remaining = 92 - prev;
            const increment = Math.max(0.05, remaining * 0.02);
            return Math.min(prev + increment, 92);
          });
        }, 200);

        const result = await planFromScores(
          frames,
          scores,
          state.selectedTemplate?.name
        );

        clearInterval(plannerTimer);
        processResult(result);
      } catch (err) {
        handleError(err);
      }
    }

    function processResult(result: Awaited<ReturnType<typeof planFromScores>>) {
      setPassIndex(isReplan ? 1 : 3);
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
        setError("Request timed out. Try shorter clips or fewer files, then try again.");
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

  const passes = isReplan ? REPLAN_PASSES : DETECTION_PASSES;

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
