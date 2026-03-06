"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { ArrowLeft, Download, Type, Music, Palette, Trash2, ChevronLeft, ChevronRight, Film, Image, Play, Scissors, Gauge, Sparkles, Loader2 } from "lucide-react";
import { useApp, getMediaFile } from "@/lib/store";
import { ALL_FILTERS, VIDEO_FILTERS } from "@/lib/filters";
import { getAvailableTracks, getSuggestedTrackForTemplate } from "@/lib/music";
import { getEditingStyle, ALL_THEMES } from "@/lib/editing-styles";
import { formatTime, haptic } from "@/lib/utils";
import TapePreviewPlayer from "@/components/TapePreviewPlayer";
import { ALL_VELOCITY_PRESETS, VELOCITY_LABELS } from "@/lib/velocity";
import type { VideoFilter, CaptionStyle, MusicTrack, EditedClip, EditingTheme, VelocityPreset, AiMusicStatus } from "@/lib/types";
import type { Action } from "@/lib/store";

const CAPTION_STYLES: { value: CaptionStyle; label: string; css: string }[] = [
  { value: "Bold", label: "Bold", css: "text-2xl font-black uppercase tracking-wider" },
  { value: "Minimal", label: "Minimal", css: "text-lg font-light tracking-wide" },
  { value: "Neon", label: "Neon", css: "text-xl font-bold [text-shadow:0_0_10px_#7C3AED,0_0_20px_#EC4899]" },
  { value: "Classic", label: "Classic", css: "text-xl font-serif italic" },
];

type EditorTab = "trim" | "speed" | "music" | "caption" | "filter";
type EditorMode = "preview" | "edit";

export default function EditorStep() {
  const { state, dispatch } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>("trim");
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<EditorMode>("preview");

  const sortedClips = useMemo(
    () => [...state.clips].sort((a, b) => a.order - b.order),
    [state.clips]
  );

  const activeIndex = sortedClips.findIndex((c) => c.id === state.activeClipId);
  const clip = activeIndex >= 0 ? sortedClips[activeIndex] : sortedClips[0];

  const media = clip ? getMediaFile(state, clip.sourceFileId) : null;
  // Animated photos become videos — use the generated video URL and treat as video
  const hasAnimatedVideo = media?.type === "photo" &&
    media.animationStatus === "completed" &&
    media.animatedVideoUrl;
  const isPhoto = media?.type === "photo" && !hasAnimatedVideo;
  const mediaUrl = hasAnimatedVideo ? media.animatedVideoUrl! : (media?.url ?? null);

  // Auto-suggest music from template
  useEffect(() => {
    if (clip && !clip.selectedMusicTrack && state.selectedTemplate) {
      const suggested = getSuggestedTrackForTemplate(state.selectedTemplate);
      if (suggested) {
        dispatch({
          type: "UPDATE_CLIP",
          clipId: clip.id,
          updates: { selectedMusicTrack: suggested },
        });
      }
    }
  }, [clip, state.selectedTemplate, dispatch]);

  if (!clip) return null;

  const duration = clip.trimEnd - clip.trimStart;
  const filterCSS = VIDEO_FILTERS[clip.selectedFilter];
  const captionCSS = CAPTION_STYLES.find((s) => s.value === clip.captionStyle)?.css ?? "";
  const totalTapeDuration = sortedClips.reduce((sum, c) => sum + (c.trimEnd - c.trimStart), 0);

  const updateClip = (updates: Partial<EditedClip>) => {
    dispatch({ type: "UPDATE_CLIP", clipId: clip.id, updates });
  };

  const handlePlay = () => {
    if (isPhoto) return;
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.currentTime = clip.trimStart;
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleExport = () => {
    haptic();
    dispatch({ type: "SET_STEP", step: "export" });
  };

  const handlePrevClip = () => {
    if (activeIndex > 0) {
      dispatch({ type: "SET_ACTIVE_CLIP", clipId: sortedClips[activeIndex - 1].id });
      setIsPlaying(false);
    }
  };

  const handleNextClip = () => {
    if (activeIndex < sortedClips.length - 1) {
      dispatch({ type: "SET_ACTIVE_CLIP", clipId: sortedClips[activeIndex + 1].id });
      setIsPlaying(false);
    }
  };

  const handleRemoveClip = () => {
    if (sortedClips.length <= 1) return;
    dispatch({ type: "REMOVE_CLIP", clipId: clip.id });
    setIsPlaying(false);
  };

  const tabs: { id: EditorTab; icon: React.ReactNode; label: string }[] = [
    { id: "trim", icon: <ArrowLeft className="h-4 w-4 rotate-90" />, label: "Trim" },
    { id: "speed", icon: <Gauge className="h-4 w-4" />, label: "Speed" },
    { id: "music", icon: <Music className="h-4 w-4" />, label: "Music" },
    { id: "caption", icon: <Type className="h-4 w-4" />, label: "Caption" },
    { id: "filter", icon: <Palette className="h-4 w-4" />, label: "Filter" },
  ];

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
        <h2 className="font-semibold text-white">Edit Highlight Tape</h2>
        <button onClick={handleExport} className="btn-primary !px-4 !py-2 text-sm flex items-center gap-1.5">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      {/* Mode toggle: Preview Tape / Edit Clips */}
      <div className="flex gap-1 rounded-xl bg-white/5 p-1">
        <button
          onClick={() => {
            setMode("preview");
            haptic(5);
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors ${
            mode === "preview"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--text-tertiary)] hover:text-white"
          }`}
        >
          <Play className="h-4 w-4" />
          Preview Tape
        </button>
        <button
          onClick={() => {
            setMode("edit");
            haptic(5);
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors ${
            mode === "edit"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--text-tertiary)] hover:text-white"
          }`}
        >
          <Scissors className="h-4 w-4" />
          Edit Clips
        </button>
      </div>

      {/* ═══ PREVIEW MODE ═══ */}
      {mode === "preview" && (
        <>
          {/* Detected theme badge + switcher */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--text-tertiary)]">
                AI-detected style: <span className="font-semibold text-white">{getEditingStyle(state.detectedTheme).label}</span>
              </p>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                {getEditingStyle(state.detectedTheme).description.split("—")[0].trim()}
              </p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {ALL_THEMES.map((t) => {
                const s = getEditingStyle(t);
                return (
                  <button
                    key={t}
                    onClick={() => {
                      dispatch({ type: "SET_THEME", theme: t });
                      haptic(5);
                    }}
                    className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      state.detectedTheme === t
                        ? "bg-[var(--accent)] text-white"
                        : "bg-white/5 text-[var(--text-tertiary)] hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Full tape preview player */}
          <div className="w-full max-w-xs self-center">
            <TapePreviewPlayer />
          </div>

          {/* Tape info */}
          <div className="text-center text-xs text-[var(--text-tertiary)]">
            {sortedClips.length} clips · ~{Math.round(totalTapeDuration)}s total
          </div>
        </>
      )}

      {/* ═══ EDIT MODE ═══ */}
      {mode === "edit" && (
        <>
          {/* Clip navigator */}
          <div className="flex items-center justify-between rounded-xl bg-white/5 p-2">
            <button
              onClick={handlePrevClip}
              disabled={activeIndex <= 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              {sortedClips.map((c, i) => {
                const m = getMediaFile(state, c.sourceFileId);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      dispatch({ type: "SET_ACTIVE_CLIP", clipId: c.id });
                      setIsPlaying(false);
                    }}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-all ${
                      c.id === clip.id
                        ? "bg-[var(--accent)] text-white"
                        : "bg-white/5 text-[var(--text-tertiary)] hover:bg-white/10"
                    }`}
                  >
                    {m?.type === "photo" ? <Image className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleNextClip}
              disabled={activeIndex >= sortedClips.length - 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Tape duration summary */}
          <div className="text-center text-xs text-[var(--text-tertiary)]">
            Clip {activeIndex + 1} of {sortedClips.length} · Total tape: ~{Math.round(totalTapeDuration)}s
            {media && <span className="ml-1">· from: {media.name}</span>}
          </div>

          {/* Video/Photo preview with filter + caption overlay */}
          <div className="relative aspect-[9/16] w-full max-w-xs self-center overflow-hidden rounded-2xl bg-black">
            {isPhoto && mediaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl}
                alt={clip.segment.label}
                className="h-full w-full object-cover"
                style={{ filter: filterCSS }}
              />
            )}
            {!isPhoto && mediaUrl && (
              <video
                ref={videoRef}
                src={`${mediaUrl}#t=${clip.trimStart}`}
                className="h-full w-full object-cover"
                style={{ filter: filterCSS }}
                playsInline
                onClick={handlePlay}
                onTimeUpdate={() => {
                  const video = videoRef.current;
                  if (video && video.currentTime >= clip.trimEnd) {
                    video.pause();
                    video.currentTime = clip.trimStart;
                    setIsPlaying(false);
                  }
                }}
              />
            )}

            {/* Caption overlay */}
            {clip.captionText && (
              <div className="absolute inset-x-0 bottom-16 flex justify-center px-4">
                <p className={`rounded-lg bg-black/40 px-4 py-2 text-center text-white backdrop-blur-sm ${captionCSS}`}>
                  {clip.captionText}
                </p>
              </div>
            )}

            {/* Play overlay (video only) */}
            {!isPhoto && !isPlaying && (
              <button
                onClick={handlePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/20"
                aria-label="Play preview"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  <div className="ml-1 h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-white" />
                </div>
              </button>
            )}

            {/* Time badge */}
            <div className="absolute right-2 top-2 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
              {isPhoto ? "Photo · 3s" : `${Math.round(duration)}s`}
            </div>

            {/* Type badge */}
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
              {isPhoto ? <Image className="h-3 w-3" /> : <Film className="h-3 w-3" />}
              Clip {activeIndex + 1}
            </div>
          </div>

          {/* Remove clip button */}
          {sortedClips.length > 1 && (
            <button
              onClick={handleRemoveClip}
              className="mx-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove this clip from tape
            </button>
          )}

          {/* Tab bar */}
          <div className="flex gap-1 rounded-xl bg-white/5 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  haptic(5);
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-tertiary)] hover:text-white"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="glass-card flex-1 p-4">
            {activeTab === "trim" && !isPhoto && (
              <TrimPanel clip={clip} maxDuration={media?.duration ?? 0} onUpdate={updateClip} />
            )}
            {activeTab === "trim" && isPhoto && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-[var(--text-tertiary)]">
                <Image className="h-8 w-8" />
                Photos display for 3 seconds in the final tape.
                <br />
                No trimming needed.
              </div>
            )}
            {activeTab === "speed" && !isPhoto && (
              <VelocityPanel
                selected={clip.velocityPreset ?? "normal"}
                onSelect={(v) => updateClip({ velocityPreset: v })}
              />
            )}
            {activeTab === "speed" && isPhoto && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-[var(--text-tertiary)]">
                <Gauge className="h-8 w-8" />
                Speed curves apply to video clips only.
              </div>
            )}
            {activeTab === "music" && (
              <MusicPanel
                selected={clip.selectedMusicTrack}
                isPro={state.isProUser}
                onSelect={(track) => updateClip({ selectedMusicTrack: track })}
                aiMusicEnabled={state.aiMusicEnabled}
                aiMusicStatus={state.aiMusicStatus}
                aiMusicUrl={state.aiMusicUrl}
                aiMusicPrompt={state.aiMusicPrompt}
                contentSummary={state.contentSummary}
                detectedTheme={state.detectedTheme}
                dispatch={dispatch}
              />
            )}
            {activeTab === "caption" && (
              <CaptionPanel
                text={clip.captionText}
                style={clip.captionStyle}
                onTextChange={(t) => updateClip({ captionText: t })}
                onStyleChange={(s) => updateClip({ captionStyle: s })}
              />
            )}
            {activeTab === "filter" && (
              <FilterPanel
                selected={clip.selectedFilter}
                onSelect={(f) => updateClip({ selectedFilter: f })}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-panels ──

function TrimPanel({
  clip,
  maxDuration,
  onUpdate,
}: {
  clip: { trimStart: number; trimEnd: number };
  maxDuration: number;
  onUpdate: (u: { trimStart?: number; trimEnd?: number }) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-2 flex items-center justify-between text-sm text-[var(--text-secondary)]">
          <span>Start</span>
          <span className="font-mono text-white">{formatTime(clip.trimStart)}</span>
        </label>
        <input
          type="range"
          min={0}
          max={maxDuration}
          step={0.1}
          value={clip.trimStart}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (v < clip.trimEnd - 2) onUpdate({ trimStart: v });
          }}
          className="w-full"
        />
      </div>
      <div>
        <label className="mb-2 flex items-center justify-between text-sm text-[var(--text-secondary)]">
          <span>End</span>
          <span className="font-mono text-white">{formatTime(clip.trimEnd)}</span>
        </label>
        <input
          type="range"
          min={0}
          max={maxDuration}
          step={0.1}
          value={clip.trimEnd}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (v > clip.trimStart + 2) onUpdate({ trimEnd: v });
          }}
          className="w-full"
        />
      </div>
      <p className="text-center text-xs text-[var(--text-tertiary)]">
        Duration: {Math.round(clip.trimEnd - clip.trimStart)}s
      </p>
    </div>
  );
}

function MusicPanel({
  selected,
  isPro,
  onSelect,
  aiMusicEnabled,
  aiMusicStatus,
  aiMusicUrl,
  aiMusicPrompt,
  contentSummary,
  detectedTheme,
  dispatch,
}: {
  selected: MusicTrack | null;
  isPro: boolean;
  onSelect: (track: MusicTrack | null) => void;
  aiMusicEnabled: boolean;
  aiMusicStatus: AiMusicStatus;
  aiMusicUrl: string | null;
  aiMusicPrompt: string;
  contentSummary: string;
  detectedTheme: EditingTheme;
  dispatch: React.Dispatch<Action>;
}) {
  const tracks = getAvailableTracks(isPro);

  const handleGenerate = async () => {
    // Build prompt from user input or auto-generate from content context
    const prompt = aiMusicPrompt.trim()
      || `Instrumental background music for a ${detectedTheme} highlight reel. ${contentSummary}`.trim();

    if (!prompt) return;

    dispatch({ type: "SET_AI_MUSIC_RESULT", status: "generating" });

    try {
      const res = await fetch("/api/music/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();

      if (!res.ok || data.status !== "completed" || !data.audioUrl) {
        dispatch({ type: "SET_AI_MUSIC_RESULT", status: "failed" });
        return;
      }

      dispatch({ type: "SET_AI_MUSIC_RESULT", status: "completed", audioUrl: data.audioUrl });
      // Auto-select the AI track
      onSelect({
        id: "__ai_generated__",
        name: "AI Generated",
        fileName: "",
        artist: "ElevenLabs",
        mood: "Upbeat",
        category: "General",
        bpm: 120,
        durationSeconds: data.duration ?? 60,
        isPremium: true,
      });
    } catch {
      dispatch({ type: "SET_AI_MUSIC_RESULT", status: "failed" });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* AI Music generation controls — shown when enabled on upload page */}
      {aiMusicEnabled && (
        <>
          <div className="flex flex-col gap-2 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-white">AI Generated Music</span>
            </div>
            <input
              type="text"
              value={aiMusicPrompt}
              onChange={(e) => dispatch({ type: "SET_AI_MUSIC_PROMPT", prompt: e.target.value })}
              placeholder={`e.g. "Upbeat electronic for a ${detectedTheme} montage"`}
              maxLength={500}
              disabled={aiMusicStatus === "generating"}
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
            />
            <button
              onClick={handleGenerate}
              disabled={aiMusicStatus === "generating"}
              className="flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]/80 disabled:opacity-50"
            >
              {aiMusicStatus === "generating" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Composing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {aiMusicStatus === "completed" ? "Regenerate" : "Generate Music"}
                </>
              )}
            </button>

            {aiMusicStatus === "completed" && aiMusicUrl && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-2">
                <Music className="h-4 w-4 text-green-400" />
                <span className="text-xs text-green-400">AI music ready and applied to your tape</span>
              </div>
            )}

            {aiMusicStatus === "failed" && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-2">
                <span className="text-xs text-red-400">Generation failed. Try again with a different prompt.</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">or choose a track</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
        </>
      )}

      {/* Curated tracks */}
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
        <button
          onClick={() => onSelect(null)}
          className={`flex items-center gap-3 rounded-lg p-3 text-left transition-colors ${
            !selected ? "bg-[var(--accent)]/10 border border-[var(--accent)]" : "bg-white/5 hover:bg-white/10"
          }`}
        >
          <Music className="h-4 w-4 text-[var(--text-tertiary)]" />
          <span className="text-sm text-[var(--text-secondary)]">No Music</span>
        </button>

        {tracks.map((track) => (
          <button
            key={track.id}
            onClick={() => {
              onSelect(track);
              haptic(5);
            }}
            className={`flex items-center gap-3 rounded-lg p-3 text-left transition-colors ${
              selected?.id === track.id
                ? "bg-[var(--accent)]/10 border border-[var(--accent)]"
                : "bg-white/5 hover:bg-white/10"
            }`}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
              <Music className="h-4 w-4 text-[var(--accent)]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{track.name}</p>
              <p className="text-xs text-[var(--text-tertiary)]">
                {track.mood} · {track.bpm} BPM
              </p>
            </div>
            {track.isPremium && !isPro && (
              <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">PRO</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function CaptionPanel({
  text,
  style,
  onTextChange,
  onStyleChange,
}: {
  text: string;
  style: CaptionStyle;
  onTextChange: (t: string) => void;
  onStyleChange: (s: CaptionStyle) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Add a caption..."
        maxLength={80}
        className="w-full rounded-lg bg-white/5 p-3 text-white placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      />
      <div className="grid grid-cols-2 gap-2">
        {CAPTION_STYLES.map((s) => (
          <button
            key={s.value}
            onClick={() => {
              onStyleChange(s.value);
              haptic(5);
            }}
            className={`rounded-lg p-3 text-center transition-colors ${
              style === s.value
                ? "bg-[var(--accent)]/10 border-2 border-[var(--accent)]"
                : "border border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <p className={`text-white ${s.css} !text-sm`}>{s.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterPanel({
  selected,
  onSelect,
}: {
  selected: VideoFilter;
  onSelect: (f: VideoFilter) => void;
}) {
  // Human-readable display names for filters
  const displayNames: Partial<Record<VideoFilter, string>> = {
    GoldenHour: "Golden Hour",
    TealOrange: "Teal & Orange",
    MoodyCinematic: "Moody",
    CleanAiry: "Clean Airy",
    VintageFilm: "Vintage",
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Standard</p>
      <div className="grid grid-cols-3 gap-2">
        {(["None", "Vibrant", "Warm", "Cool", "Noir", "Fade"] as VideoFilter[]).map((filter) => (
          <button
            key={filter}
            onClick={() => { onSelect(filter); haptic(5); }}
            className={`flex flex-col items-center gap-2 rounded-xl p-3 transition-all ${
              selected === filter
                ? "bg-[var(--accent)]/10 border-2 border-[var(--accent)] scale-[1.02]"
                : "border border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <div
              className="h-10 w-full rounded-lg bg-gradient-to-br from-purple-500 to-pink-500"
              style={{ filter: VIDEO_FILTERS[filter] }}
            />
            <span className="text-xs font-medium text-white">{filter}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Cinematic</p>
      <div className="grid grid-cols-3 gap-2">
        {(["GoldenHour", "TealOrange", "MoodyCinematic", "CleanAiry", "VintageFilm"] as VideoFilter[]).map((filter) => (
          <button
            key={filter}
            onClick={() => { onSelect(filter); haptic(5); }}
            className={`flex flex-col items-center gap-2 rounded-xl p-3 transition-all ${
              selected === filter
                ? "bg-[var(--accent)]/10 border-2 border-[var(--accent)] scale-[1.02]"
                : "border border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <div
              className="h-10 w-full rounded-lg bg-gradient-to-br from-orange-400 to-teal-500"
              style={{ filter: VIDEO_FILTERS[filter] }}
            />
            <span className="text-[10px] font-medium text-white">{displayNames[filter] ?? filter}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function VelocityPanel({
  selected,
  onSelect,
}: {
  selected: VelocityPreset;
  onSelect: (v: VelocityPreset) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--text-tertiary)]">
        Speed curves control playback speed over the clip — the signature viral edit technique.
      </p>
      <div className="flex flex-col gap-2">
        {ALL_VELOCITY_PRESETS.map((preset) => {
          const info = VELOCITY_LABELS[preset];
          return (
            <button
              key={preset}
              onClick={() => { onSelect(preset); haptic(5); }}
              className={`flex items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                selected === preset
                  ? "bg-[var(--accent)]/10 border border-[var(--accent)]"
                  : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                preset === "normal" ? "bg-white/10" : "bg-gradient-to-br from-purple-500/30 to-pink-500/30"
              }`}>
                <Gauge className={`h-4 w-4 ${selected === preset ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{info.label}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{info.description}</p>
              </div>
              {preset !== "normal" && (
                <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">
                  Viral
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
