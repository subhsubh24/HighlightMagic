"use client";

import { useState, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Play,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Film,
  Image,
  Music,
  Volume2,
  Sparkles,
  Clapperboard,
  Mic,
  Zap,
  ImageIcon,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { useApp, getMediaFile } from "@/lib/store";
import { getEditingStyle } from "@/lib/editing-styles";
import { haptic } from "@/lib/utils";
import TapePreviewPlayer from "@/components/TapePreviewPlayer";
import type { GenerationStatus } from "@/lib/types";

/** Compact status dot + label for AI production tracks */
function StatusBadge({ status, label }: { status: GenerationStatus; label: string }) {
  if (status === "idle") return null;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 transition-colors hover:bg-white/5">
      {status === "generating" && <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />}
      {status === "completed" && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
      {status === "failed" && <XCircle className="h-3 w-3 text-red-400" />}
      <span className="flex-1 text-xs text-[var(--text-secondary)]">{label}</span>
      <span className={`text-[10px] font-medium tabular-nums ${
        status === "completed" ? "text-emerald-400" :
        status === "failed" ? "text-red-400" :
        "text-[var(--accent)]"
      }`}>
        {status === "generating" ? "In progress" : status === "completed" ? "Done" : "Failed"}
      </span>
    </div>
  );
}

export default function EditorStep() {
  const { state, dispatch } = useApp();
  const [showClips, setShowClips] = useState(false);

  const sortedClips = useMemo(
    () => [...state.clips].sort((a, b) => a.order - b.order),
    [state.clips]
  );

  const style = getEditingStyle(state.detectedTheme);
  const defaultTransDur = state.aiProductionPlan?.defaultTransitionDuration ?? 0.3;
  const totalTapeDuration = sortedClips.reduce((sum, c, i) => {
    const dur = c.trimEnd - c.trimStart;
    const overlap = (i < sortedClips.length - 1) ? (sortedClips[i + 1]?.transitionDuration ?? defaultTransDur) : 0;
    return sum + dur - overlap;
  }, 0);

  const handleExport = () => {
    haptic();
    dispatch({ type: "SET_STEP", step: "export" });
  };

  const handleRegenerate = () => {
    haptic();
    dispatch({ type: "SET_REGENERATE_FEEDBACK", feedback: "Regenerate with different creative choices" });
    dispatch({ type: "SET_STEP", step: "detecting" });
  };

  const handleRemoveClip = (clipId: string) => {
    if (sortedClips.length <= 1) return;
    dispatch({ type: "REMOVE_CLIP", clipId });
  };

  // Derive statuses for the status panel
  const musicStatus: GenerationStatus =
    state.aiMusicStatus === "completed" ? "completed" :
    state.aiMusicStatus === "generating" ? "generating" :
    state.aiMusicStatus === "failed" ? "failed" : "idle";

  const introStatus: GenerationStatus = state.introCard?.status ?? "idle";
  const outroStatus: GenerationStatus = state.outroCard?.status ?? "idle";
  const sfxStatus = state.sfxStatus;
  const voiceoverStatus = state.voiceoverStatus;

  const hasAnyProduction = musicStatus !== "idle" || introStatus !== "idle" || outroStatus !== "idle" || sfxStatus !== "idle" || voiceoverStatus !== "idle";

  const allReady = [musicStatus, introStatus, outroStatus, sfxStatus, voiceoverStatus]
    .filter((s) => s !== "idle")
    .every((s) => s === "completed" || s === "failed");

  return (
    <div className="flex flex-1 flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: "results" })}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="font-semibold text-white">Review Your Tape</h2>
        <button onClick={handleExport} className="btn-primary !px-4 !py-2 text-sm flex items-center gap-1.5">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      {/* AI style badge */}
      <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm text-white">{style.label} style</span>
        </div>
        <span className="text-xs text-[var(--text-tertiary)]">
          {sortedClips.length} clips · ~{Math.round(totalTapeDuration)}s
        </span>
      </div>

      {/* Full tape preview — the star of the show */}
      <div className="w-full max-w-[240px] sm:max-w-xs self-center">
        <TapePreviewPlayer />
      </div>

      {/* AI Production Status Panel */}
      {hasAnyProduction && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="text-xs font-medium text-white">AI Production</span>
            </div>
            {!allReady ? (
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />
                <span className="text-[10px] text-[var(--accent)]">Working...</span>
              </div>
            ) : (
              <span className="text-[10px] text-emerald-400 font-medium">All ready</span>
            )}
          </div>
          <div className="flex flex-col gap-0.5 p-1.5">
            <StatusBadge status={musicStatus} label="Background Music" />
            <StatusBadge status={sfxStatus} label="Sound Effects" />
            <StatusBadge status={voiceoverStatus} label="Voiceover" />
            <StatusBadge status={introStatus} label="Intro Card" />
            <StatusBadge status={outroStatus} label="Outro Card" />
          </div>
        </div>
      )}

      {/* Clip list — collapsible */}
      <button
        onClick={() => { setShowClips(!showClips); haptic(5); }}
        aria-expanded={showClips}
        aria-label={`${showClips ? "Hide" : "Show"} clip list`}
        className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2.5 transition-colors hover:bg-white/10"
      >
        <span className="text-sm text-[var(--text-secondary)]">
          {showClips ? "Hide" : "Show"} clips ({sortedClips.length})
        </span>
        <ChevronRight className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${showClips ? "rotate-90" : ""}`} />
      </button>

      {showClips && (
        <div className="flex flex-col gap-1.5 animate-fade-in">
          {sortedClips.map((c, i) => {
            const m = getMediaFile(state, c.sourceFileId);
            const dur = c.trimEnd - c.trimStart;
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
                  {m?.type === "photo" ? (
                    <Image className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  ) : (
                    <Film className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    Clip {i + 1}
                    {c.captionText && <span className="ml-1 text-[var(--text-tertiary)]">· {c.captionText}</span>}
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    {Math.round(dur)}s · {c.selectedFilter !== "None" ? c.selectedFilter : "No filter"}
                  </p>
                </div>
                {sortedClips.length > 1 && (
                  <button
                    onClick={() => handleRemoveClip(c.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400/50 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Remove clip"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)] to-transparent px-4 pt-6 pb-2">
        <div className="flex gap-2">
          <button
            onClick={handleRegenerate}
            aria-label="Regenerate highlight tape"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/5 py-3 text-sm text-[var(--text-secondary)] transition-colors hover:bg-white/10 active:scale-[0.98]"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </button>
          <button
            onClick={handleExport}
            aria-label="Export highlight tape"
            className="btn-primary group flex flex-[2] items-center justify-center gap-2 !py-3"
          >
            <Download className="h-4 w-4" />
            Export Tape
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
