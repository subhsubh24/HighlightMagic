"use client";

import { ArrowLeft, Play, Scissors, Award, Film, Image, ArrowRight, GripVertical, VideoOff, RefreshCw, Send, Sparkles, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { useApp, getMediaFile } from "@/lib/store";
import { formatTime, haptic } from "@/lib/utils";
import { useRef, useState } from "react";
import { getCachedDetectionData } from "@/lib/detection-cache";

const QUICK_PRESETS = [
  { label: "Faster paced", feedback: "Make it faster paced with shorter clips and quicker cuts" },
  { label: "More cinematic", feedback: "More cinematic and dramatic — slower, more breathing room, elegant transitions" },
  { label: "Keep it short", feedback: "Keep it under 15 seconds — only the absolute best moments, rapid-fire" },
  { label: "More faces", feedback: "Focus on faces, reactions, and human emotion — people connect with people" },
];

export default function ResultsStep() {
  const { state, dispatch } = useApp();
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemIndex = useRef<number | null>(null);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [customFeedback, setCustomFeedback] = useState("");

  const sortedClips = [...state.clips].sort((a, b) => a.order - b.order);
  const totalDuration = sortedClips.reduce((sum, c) => sum + (c.trimEnd - c.trimStart), 0);

  // Check if regeneration is possible (cached data available)
  const canRegenerate = getCachedDetectionData().frames !== null;

  const handleEditAll = () => {
    haptic();
    if (sortedClips.length > 0) {
      dispatch({ type: "SET_ACTIVE_CLIP", clipId: sortedClips[0].id });
    }
    dispatch({ type: "SET_STEP", step: "editor" });
  };

  const handleRegenerate = (feedback: string) => {
    if (!feedback.trim()) return;
    haptic();
    dispatch({ type: "SET_REGENERATE_FEEDBACK", feedback: feedback.trim() });
    dispatch({ type: "SET_STEP", step: "detecting" });
  };

  // Retry failed photo animations by re-running detection (animations trigger in processResult)
  const handleRetryAnimations = () => {
    haptic();
    // Reset failed animations to idle so they'll be re-attempted
    for (const media of state.mediaFiles) {
      if (media.animationStatus === "failed" && media.animatePhoto) {
        dispatch({
          type: "SET_ANIMATION_RESULT",
          fileId: media.id,
          animatedVideoUrl: null,
          animationStatus: "idle",
        });
      }
    }
    dispatch({ type: "SET_REGENERATE_FEEDBACK", feedback: "Re-run with same plan — retry photo animations" });
    dispatch({ type: "SET_STEP", step: "detecting" });
  };

  const failedAnimations = state.mediaFiles.filter(
    (f) => f.type === "photo" && f.animatePhoto && f.animationStatus === "failed"
  );

  // Drag-to-reorder handlers
  const handleDragStart = (index: number) => {
    dragItemIndex.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragItemIndex.current !== null && dragOverIndex !== null && dragItemIndex.current !== dragOverIndex) {
      dispatch({ type: "REORDER_CLIPS", fromIndex: dragItemIndex.current, toIndex: dragOverIndex });
    }
    dragItemIndex.current = null;
    setDragOverIndex(null);
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
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">
            Your Highlight Tape
          </h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            {sortedClips.length} clips · ~{Math.round(totalDuration)}s total — drag to reorder
          </p>
        </div>
        {/* Regenerate toggle */}
        {canRegenerate && sortedClips.length > 0 && (
          <button
            onClick={() => setShowRegenerate(!showRegenerate)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              showRegenerate
                ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </button>
        )}
      </div>

      {/* Regenerate panel */}
      {showRegenerate && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3 animate-fade-in">
          <p className="text-sm font-medium text-white">
            What should change?
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            The AI will re-plan using the same footage analysis — no re-scoring needed, just a fresh creative direction.
          </p>
          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handleRegenerate(preset.feedback)}
                className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent)]/20 hover:text-[var(--accent)]"
              >
                {preset.label}
              </button>
            ))}
          </div>
          {/* Custom input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customFeedback}
              onChange={(e) => setCustomFeedback(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRegenerate(customFeedback)}
              placeholder='e.g. "focus on the food shots" or "make it feel like a movie trailer"'
              className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
            />
            <button
              onClick={() => handleRegenerate(customFeedback)}
              disabled={!customFeedback.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* AI content summary */}
      {state.contentSummary && sortedClips.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
          <p className="text-sm text-[var(--text-secondary)] italic leading-relaxed">
            {state.contentSummary}
          </p>
        </div>
      )}

      {/* Failed animation banner */}
      {failedAnimations.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 animate-fade-in">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-300">
              {failedAnimations.length === 1
                ? `Animation failed for "${failedAnimations[0].name}"`
                : `Animation failed for ${failedAnimations.length} photos`}
            </p>
            <p className="mt-0.5 text-xs text-red-400/70">
              This usually means the animation API key is missing or the service is temporarily unavailable.
            </p>
          </div>
          <button
            onClick={handleRetryAnimations}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {sortedClips.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 py-16 animate-fade-in">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/5">
            <VideoOff className="h-10 w-10 text-[var(--text-tertiary)]" />
          </div>
          <h3 className="text-xl font-bold text-white">No Highlights Found</h3>
          <p className="max-w-sm text-center text-sm text-[var(--text-secondary)]">
            Try different videos or photos — clips with more action, faces, or variety tend to work best.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => dispatch({ type: "SET_STEP", step: "upload" })}
              className="btn-primary"
            >
              Try Different Files
            </button>
          </div>
        </div>
      )}

      {/* Tape overview — horizontal mini-timeline */}
      {sortedClips.length > 0 && (<><div className="flex gap-1 rounded-xl bg-white/5 p-2 overflow-x-auto">
        {sortedClips.map((clip, index) => {
          const media = getMediaFile(state, clip.sourceFileId);
          const duration = clip.trimEnd - clip.trimStart;
          const widthPct = Math.max(15, (duration / totalDuration) * 100);
          return (
            <div
              key={clip.id}
              className="flex-shrink-0 rounded-lg bg-[var(--accent)]/20 px-2 py-1 text-center text-[10px] text-[var(--accent)]"
              style={{ width: `${widthPct}%`, minWidth: "60px" }}
            >
              {index + 1}. {Math.round(duration)}s
              {media && (
                <div className="truncate text-[9px] text-[var(--text-tertiary)]">{media.name}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Clip cards */}
      <div className="flex flex-col gap-3">
        {sortedClips.map((clip, index) => {
          const media = getMediaFile(state, clip.sourceFileId);
          const hasAnimatedVideo = media?.type === "photo" &&
            media.animationStatus === "completed" &&
            media.animatedVideoUrl;
          const isPhoto = media?.type === "photo" && !hasAnimatedVideo;
          const mediaUrl = hasAnimatedVideo ? media.animatedVideoUrl! : media?.url;

          return (
            <div
              key={clip.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`glass-card group flex gap-4 p-4 text-left transition-all cursor-grab active:cursor-grabbing ${
                dragOverIndex === index
                  ? "border-[var(--accent)] scale-[1.01]"
                  : "hover:border-white/20"
              }`}
            >
              {/* Order + drag handle */}
              <div className="flex flex-col items-center justify-center gap-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                  {index + 1}
                </div>
                <GripVertical className="h-4 w-4 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Thumbnail */}
              <div className="relative aspect-[9/16] w-20 flex-shrink-0 overflow-hidden rounded-lg bg-black/40">
                {mediaUrl && isPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl}
                    alt={clip.segment.label}
                    className="h-full w-full object-cover"
                  />
                )}
                {mediaUrl && !isPhoto && (
                  <video
                    src={`${mediaUrl}#t=${clip.segment.startTime}`}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="h-6 w-6 text-white" />
                </div>
                {/* #1 badge */}
                {index === 0 && (
                  <div className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500">
                    <Award className="h-3 w-3 text-black" />
                  </div>
                )}
                {/* Type badge */}
                <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
                  {media?.animationStatus === "generating" ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin text-[var(--accent)]" />
                  ) : media?.animationStatus === "failed" ? (
                    <AlertTriangle className="h-2.5 w-2.5 text-red-400" />
                  ) : hasAnimatedVideo ? (
                    <Sparkles className="h-2.5 w-2.5 text-[var(--accent)]" />
                  ) : isPhoto ? <Image className="h-2.5 w-2.5" /> : <Film className="h-2.5 w-2.5" />}
                </div>
              </div>

              {/* Info */}
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <p className="font-semibold text-white">{clip.segment.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                    {hasAnimatedVideo
                      ? `Photo · ${Math.round(clip.trimEnd - clip.trimStart)}s`
                      : isPhoto
                        ? `Photo · ${Math.round(clip.trimEnd - clip.trimStart)}s`
                        : `${formatTime(clip.segment.startTime)} – ${formatTime(clip.segment.endTime)} · ${Math.round(clip.segment.endTime - clip.segment.startTime)}s`}
                    {media?.animationStatus === "failed" && (
                      <span className="ml-1 text-red-400"> · animation failed</span>
                    )}
                    {media?.animationStatus === "generating" && (
                      <span className="ml-1 text-[var(--accent)]"> · animating...</span>
                    )}
                  </p>
                  {media && (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
                      from: {media.name}
                    </p>
                  )}
                </div>

                {/* AI editing decisions */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {clip.velocityPreset && clip.velocityPreset !== "normal" && (
                    <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
                      {clip.velocityPreset.replace("_", " ")}
                    </span>
                  )}
                  {clip.transitionType && (
                    <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                      {clip.transitionType.replace("_", " ")}
                    </span>
                  )}
                  {clip.selectedFilter && clip.selectedFilter !== "None" && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      {clip.selectedFilter}
                    </span>
                  )}
                  {clip.captionText && (
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 truncate max-w-[120px]">
                      &quot;{clip.captionText}&quot;
                    </span>
                  )}
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
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky CTA bar */}
      <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)] to-transparent px-4 pt-6 pb-2">
        <button
          onClick={handleEditAll}
          className="btn-primary group flex w-full items-center justify-center gap-2"
        >
          <Scissors className="h-5 w-5 transition-transform group-hover:rotate-12" />
          Edit & Export Highlight Tape
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
        </button>
        {state.selectedTemplate && (
          <p className="mt-2 text-center text-[10px] text-[var(--text-tertiary)]">
            Using{" "}
            <span className="font-semibold" style={{ color: state.selectedTemplate.colorAccent }}>
              {state.selectedTemplate.name}
            </span>{" "}
            template
          </p>
        )}
      </div>
      </>)}
    </div>
  );
}
