"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { extractFrames } from "@/lib/frame-extractor";
import { detectHighlights } from "@/actions/detect";
import { uuid } from "@/lib/utils";

const DETECTION_PASSES = [
  "Extracting video frames...",
  "Analyzing motion & composition...",
  "Scoring highlight potential...",
  "Clustering best moments...",
  "Ranking clips by confidence...",
];

export default function DetectingStep() {
  const { state, dispatch } = useApp();
  const [progress, setProgress] = useState(0);
  const [passIndex, setPassIndex] = useState(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runDetection();

    async function runDetection() {
      try {
        // Phase 1: Extract frames (0-40%)
        setPassIndex(0);
        const frames = await extractFrames(
          state.videoUrl!,
          state.videoDuration,
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

        const detectedClips = await detectHighlights(
          frames,
          state.selectedTemplate?.name
        );

        clearInterval(progressTimer);
        setPassIndex(4);
        setProgress(95);

        // Convert to app types
        const highlights = detectedClips.map((c) => ({
          id: c.id,
          startTime: c.startTime,
          endTime: c.endTime,
          confidenceScore: c.confidenceScore,
          label: c.label,
          detectionSources: ["Cloud AI"],
        }));

        const clips = detectedClips.map((c) => ({
          id: uuid(),
          segment: {
            id: c.id,
            startTime: c.startTime,
            endTime: c.endTime,
            confidenceScore: c.confidenceScore,
            label: c.label,
            detectionSources: ["Cloud AI"],
          },
          trimStart: c.startTime,
          trimEnd: c.endTime,
          selectedMusicTrack: null,
          captionText: "",
          captionStyle: "Bold" as const,
          selectedFilter: state.selectedTemplate?.suggestedFilter ?? ("None" as const),
        }));

        setProgress(100);

        // Brief pause for the 100% satisfaction
        await new Promise((r) => setTimeout(r, 400));

        dispatch({ type: "SET_HIGHLIGHTS", highlights });
        dispatch({ type: "SET_CLIPS", clips });
        dispatch({ type: "SET_STEP", step: "results" });
      } catch (err) {
        console.error("Detection failed:", err);
        dispatch({ type: "SET_STEP", step: "upload" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        AI is analyzing your video for the best moments
      </p>
    </div>
  );
}
