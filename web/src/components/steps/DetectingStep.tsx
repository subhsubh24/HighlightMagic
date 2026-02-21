"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { extractFramesFromMultiple } from "@/lib/frame-extractor";
import { detectMultiClipHighlights } from "@/actions/detect";
import { templateToTheme } from "@/lib/editing-styles";
import { ALL_VELOCITY_PRESETS, type VelocityPreset } from "@/lib/velocity";
import { uuid } from "@/lib/utils";

const DETECTION_PASSES = [
  "Extracting frames from all clips...",
  "Watching everything to understand your content...",
  "Scoring the best moments...",
  "Planning your highlight tape...",
  "Applying editing style for best flow...",
];

export default function DetectingStep() {
  const { state, dispatch } = useApp();
  const [progress, setProgress] = useState(0);
  const [passIndex, setPassIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  const fileCount = state.mediaFiles.length;

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runDetection();

    async function runDetection() {
      try {
        // Phase 1: Extract frames from all media files (0-40%)
        setPassIndex(0);
        const frames = await extractFramesFromMultiple(
          state.mediaFiles,
          (pct) => setProgress(pct * 0.4)
        );

        // Phase 2-4: Detect via server action (40-90%)
        setPassIndex(1);
        setProgress(40);

        const progressTimer = setInterval(() => {
          setProgress((prev) => {
            const idx = Math.floor(((prev - 40) / 50) * 3) + 1;
            if (idx !== passIndex) setPassIndex(Math.min(idx, DETECTION_PASSES.length - 1));
            return Math.min(prev + 0.5, 88);
          });
        }, 200);

        const result = await detectMultiClipHighlights(
          frames,
          state.selectedTemplate?.name
        );

        clearInterval(progressTimer);
        setPassIndex(4);
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

        const detectedClips = result.clips;

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
          captionText: "",
          captionStyle: "Bold" as const,
          selectedFilter: state.selectedTemplate?.suggestedFilter ?? ("None" as const),
          velocityPreset: ALL_VELOCITY_PRESETS.includes(c.velocityPreset as VelocityPreset)
            ? (c.velocityPreset as VelocityPreset)
            : ("normal" as VelocityPreset),
        }));

        setProgress(100);

        // Brief pause for the 100% satisfaction
        await new Promise((r) => setTimeout(r, 400));

        dispatch({ type: "SET_HIGHLIGHTS", highlights });
        dispatch({ type: "SET_CLIPS", clips });
        dispatch({ type: "SET_STEP", step: "results" });
      } catch (err) {
        console.error("Detection failed:", err);
        setError("Detection failed. Please try again or use different files.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {DETECTION_PASSES[passIndex]}
      </p>

      <p className="text-center text-xs text-[var(--text-tertiary)]">
        AI is analyzing {fileCount} file{fileCount !== 1 ? "s" : ""} to create your highlight tape
      </p>
    </div>
  );
}
