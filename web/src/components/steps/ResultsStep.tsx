"use client";

import { ArrowLeft, Play, Scissors, Award, Film, Image, ArrowRight, GripVertical, VideoOff } from "lucide-react";
import { useApp, getMediaFile } from "@/lib/store";
import { formatTime, haptic } from "@/lib/utils";
import { useRef, useState } from "react";

export default function ResultsStep() {
  const { state, dispatch } = useApp();
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemIndex = useRef<number | null>(null);

  const sortedClips = [...state.clips].sort((a, b) => a.order - b.order);
  const totalDuration = sortedClips.reduce((sum, c) => sum + (c.trimEnd - c.trimStart), 0);

  const handleEditAll = () => {
    haptic();
    if (sortedClips.length > 0) {
      dispatch({ type: "SET_ACTIVE_CLIP", clipId: sortedClips[0].id });
    }
    dispatch({ type: "SET_STEP", step: "editor" });
  };

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
      </div>

      {/* Empty state */}
      {sortedClips.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 py-16">
          <VideoOff className="h-16 w-16 text-[var(--text-tertiary)]" />
          <h3 className="text-xl font-bold text-white">No Highlights Found</h3>
          <p className="max-w-sm text-center text-[var(--text-secondary)]">
            Try different videos or photos — clips with more action, faces, or variety tend to work best.
          </p>
          <button
            onClick={() => dispatch({ type: "SET_STEP", step: "upload" })}
            className="btn-primary"
          >
            Try Again
          </button>
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
          const isPhoto = media?.type === "photo";
          const mediaUrl = media?.url;

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
                  {isPhoto ? <Image className="h-2.5 w-2.5" /> : <Film className="h-2.5 w-2.5" />}
                </div>
              </div>

              {/* Info */}
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <p className="font-semibold text-white">{clip.segment.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                    {isPhoto
                      ? "Photo · 3s"
                      : `${formatTime(clip.segment.startTime)} – ${formatTime(clip.segment.endTime)} · ${Math.round(clip.segment.endTime - clip.segment.startTime)}s`}
                  </p>
                  {media && (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
                      from: {media.name}
                    </p>
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

      {/* Edit & Export CTA */}
      <button
        onClick={handleEditAll}
        className="btn-primary flex items-center justify-center gap-2"
      >
        <Scissors className="h-5 w-5" />
        Edit & Export Highlight Tape
        <ArrowRight className="h-5 w-5" />
      </button>

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
      </>)}
    </div>
  );
}
