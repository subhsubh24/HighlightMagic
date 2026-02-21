"use client";

import { ArrowLeft, Play, Scissors, Award } from "lucide-react";
import { useApp } from "@/lib/store";
import { formatTime, haptic } from "@/lib/utils";

export default function ResultsStep() {
  const { state, dispatch } = useApp();

  const handleEditClip = (clipId: string) => {
    haptic();
    dispatch({ type: "SET_ACTIVE_CLIP", clipId });
    dispatch({ type: "SET_STEP", step: "editor" });
  };

  return (
    <div className="flex flex-1 flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: "upload" })}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[var(--text-secondary)] transition-colors hover:bg-white/10"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">
            {state.clips.length} Highlight{state.clips.length !== 1 ? "s" : ""} Found
          </h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Ranked by AI confidence — tap to edit
          </p>
        </div>
      </div>

      {/* Clip cards */}
      <div className="flex flex-col gap-4">
        {state.clips.map((clip, index) => (
          <button
            key={clip.id}
            onClick={() => handleEditClip(clip.id)}
            className="glass-card group flex gap-4 p-4 text-left transition-all hover:scale-[1.01] hover:border-[var(--accent)]/50"
          >
            {/* Video thumbnail preview */}
            <div className="relative aspect-[9/16] w-20 flex-shrink-0 overflow-hidden rounded-lg bg-black/40">
              {state.videoUrl && (
                <video
                  src={`${state.videoUrl}#t=${clip.segment.startTime}`}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                <Play className="h-6 w-6 text-white" />
              </div>
              {/* Rank badge */}
              {index === 0 && (
                <div className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500">
                  <Award className="h-3 w-3 text-black" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <p className="font-semibold text-white">{clip.segment.label}</p>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  {formatTime(clip.segment.startTime)} – {formatTime(clip.segment.endTime)}
                  {" · "}
                  {Math.round(clip.segment.endTime - clip.segment.startTime)}s
                </p>
              </div>

              {/* Confidence bar */}
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-tertiary)]">Confidence</span>
                  <span
                    className={`font-semibold ${
                      clip.segment.confidenceScore >= 0.8
                        ? "text-[var(--success)]"
                        : clip.segment.confidenceScore >= 0.6
                          ? "text-[var(--warning)]"
                          : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {Math.round(clip.segment.confidenceScore * 100)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-accent-gradient"
                    style={{ width: `${clip.segment.confidenceScore * 100}%` }}
                  />
                </div>
              </div>

              {/* Edit CTA */}
              <div className="mt-2 flex items-center gap-1 text-xs text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100">
                <Scissors className="h-3 w-3" />
                Edit & Export
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Template badge */}
      {state.selectedTemplate && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-[var(--text-tertiary)]">
          Using{" "}
          <span
            className="font-semibold"
            style={{ color: state.selectedTemplate.colorAccent }}
          >
            {state.selectedTemplate.name}
          </span>{" "}
          template — filter & music auto-applied during edit
        </div>
      )}
    </div>
  );
}
