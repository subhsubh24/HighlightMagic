"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Film, AlertCircle, X, Image as ImageIcon, Plus, ArrowRight, GripVertical, Sparkles, Music, Mic, Loader2, Wand2, Volume2, Video, Crown } from "lucide-react";
import { useApp } from "@/lib/store";
import { MAX_UPLOAD_SIZE_MB, MAX_VIDEO_DURATION_SECONDS, MAX_FILES, PHOTO_DISPLAY_DURATION } from "@/lib/constants";
import { haptic, uuid } from "@/lib/utils";
import { clearDetectionCache } from "@/lib/detection-cache";
import type { MediaFile } from "@/lib/types";

/** Style presets — one-tap creative direction chips */
const STYLE_PRESETS = [
  { label: "Cinematic", value: "cinematic slow-mo, film grain, dramatic lighting" },
  { label: "Hype", value: "fast cuts, bass drops, high energy, flash transitions" },
  { label: "Clean", value: "minimal, clean transitions, airy bright color grade" },
  { label: "Retro VHS", value: "retro VHS aesthetic, scan lines, warm analog tones" },
  { label: "Neon", value: "neon glow, dark background, vibrant purple-blue color grade" },
  { label: "Golden Hour", value: "golden hour warmth, soft lens flare, dreamy mood" },
] as const;

/** Pro toggle component */
function ProToggle({
  icon: Icon,
  label,
  description,
  enabled,
  onToggle,
  iconColor,
}: {
  icon: typeof Music;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  iconColor: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/5 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white">{label}</span>
            <span className="rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/20 px-1.5 py-0.5 text-[9px] font-medium text-purple-300">
              <Crown className="inline h-2 w-2 mr-0.5 -mt-px" />PRO
            </span>
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)]">{description}</p>
        </div>
      </div>
      <button
        onClick={() => { onToggle(); haptic(5); }}
        role="switch"
        aria-checked={enabled}
        aria-label={`Toggle ${label}`}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          enabled ? "bg-[var(--accent)]" : "bg-white/20"
        } cursor-pointer flex-shrink-0`}
      >
        <div
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function UploadStep() {
  const { state, dispatch } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const dragItemIndex = useRef<number | null>(null);

  const hasFiles = state.mediaFiles.length > 0;
  const photoCount = state.mediaFiles.filter((f) => f.type === "photo").length;
  const videoCount = state.mediaFiles.filter((f) => f.type === "video").length;

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setError(null);
      const files = Array.from(fileList);

      if (state.mediaFiles.length + files.length > MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files allowed. You have ${state.mediaFiles.length} already.`);
        return;
      }

      const newMedia: MediaFile[] = [];

      for (const file of files) {
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");

        if (!isVideo && !isImage) {
          setError(`"${file.name}" is not a supported format. Use MP4, MOV, WebM, JPG, or PNG.`);
          continue;
        }

        if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
          setError(`"${file.name}" is too large. Maximum size is ${MAX_UPLOAD_SIZE_MB} MB.`);
          continue;
        }

        const url = URL.createObjectURL(file);

        if (isVideo) {
          const duration = await getVideoDuration(url);
          if (duration > MAX_VIDEO_DURATION_SECONDS) {
            setError(`"${file.name}" is too long. Maximum ${MAX_VIDEO_DURATION_SECONDS / 60} minutes per clip.`);
            URL.revokeObjectURL(url);
            continue;
          }
          newMedia.push({
            id: uuid(),
            file,
            url,
            type: "video",
            duration,
            name: file.name,
          });
        } else {
          newMedia.push({
            id: uuid(),
            file,
            url,
            type: "photo",
            duration: PHOTO_DISPLAY_DURATION,
            name: file.name,
            animatePhoto: false,
          });
        }
      }

      if (newMedia.length > 0) {
        haptic();
        dispatch({ type: "ADD_MEDIA", files: newMedia });
      }
    },
    [dispatch, state.mediaFiles.length]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const handleContinue = () => {
    if (state.mediaFiles.length === 0) return;
    haptic();
    dispatch({ type: "SET_REGENERATE_FEEDBACK", feedback: null });
    clearDetectionCache();
    dispatch({ type: "SET_STEP", step: "detecting" });
  };

  const handleRemove = (fileId: string) => {
    dispatch({ type: "REMOVE_MEDIA", fileId });
  };

  const handlePresetClick = (preset: typeof STYLE_PRESETS[number]) => {
    if (activePreset === preset.label) {
      setActivePreset(null);
      dispatch({ type: "SET_CREATIVE_DIRECTION", direction: "" });
    } else {
      setActivePreset(preset.label);
      dispatch({ type: "SET_CREATIVE_DIRECTION", direction: preset.value });
    }
  };

  const handleVoiceSample = async (file: File) => {
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      setError("Voice sample must be an audio file (MP3, WAV, M4A).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Voice sample must be under 10 MB.");
      return;
    }
    setVoiceUploading(true);
    try {
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read voice sample"));
        reader.readAsDataURL(file);
      });
      dispatch({ type: "SET_VOICE_SAMPLE", url: dataUri });
    } catch (e) {
      console.error("[Upload] Voice sample processing failed:", e);
      setError("Failed to process voice sample.");
    }
    setVoiceUploading(false);
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
      dispatch({ type: "REORDER_MEDIA", fromIndex: dragItemIndex.current, toIndex: dragOverIndex });
    }
    dragItemIndex.current = null;
    setDragOverIndex(null);
  };

  // Count how many pro features are enabled
  const animatedPhotoCount = state.mediaFiles.filter((f) => f.type === "photo" && f.animatePhoto).length;
  const proFeaturesEnabled = [state.aiMusicEnabled, state.sfxEnabled, state.introOutroEnabled, animatedPhotoCount > 0].filter(Boolean).length;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 animate-fade-in">
      {/* Hero text */}
      <div className="text-center">
        {hasFiles ? (
          <>
            <h1 className="mb-1 text-2xl font-bold leading-tight md:text-3xl">
              {videoCount > 0 && photoCount > 0
                ? `${videoCount} video${videoCount !== 1 ? "s" : ""} + ${photoCount} photo${photoCount !== 1 ? "s" : ""}`
                : `${state.mediaFiles.length} file${state.mediaFiles.length !== 1 ? "s" : ""}`} ready
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              AI picks the best order, transitions & effects.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-3 text-4xl font-bold leading-tight md:text-5xl">
              Drop your footage.{" "}
              <span className="gradient-text">AI does the rest.</span>
            </h1>
            <p className="mx-auto max-w-md text-[var(--text-secondary)]">
              Upload videos & photos — AI finds the best moments and creates a viral-ready highlight tape.
            </p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex w-full max-w-lg items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Uploaded files grid */}
      {hasFiles && (
        <div className="w-full max-w-lg">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-white">
              {state.mediaFiles.length} file{state.mediaFiles.length !== 1 ? "s" : ""} added
              <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                ({MAX_FILES - state.mediaFiles.length} remaining)
              </span>
            </p>
            <button
              onClick={() => dispatch({ type: "CLEAR_MEDIA" })}
              className="text-xs text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {state.mediaFiles.map((media, index) => (
              <div
                key={media.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`group relative aspect-square overflow-hidden rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                  dragOverIndex === index
                    ? "border-[var(--accent)] scale-105"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                {media.type === "video" ? (
                  <video
                    src={`${media.url}#t=1`}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media.url} alt={media.name} className="h-full w-full object-cover" />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                {/* Type badge + duration */}
                <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
                  {media.type === "video" ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                  {media.type === "video" ? `${Math.round(media.duration)}s` : "Photo"}
                </div>

                {/* Per-photo animate toggle */}
                {media.type === "photo" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "TOGGLE_PHOTO_ANIMATE", fileId: media.id });
                      haptic(5);
                    }}
                    className={`absolute left-1.5 bottom-7 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] backdrop-blur-sm transition-colors ${
                      media.animatePhoto
                        ? "bg-purple-500/70 text-white"
                        : "bg-black/40 text-white/50 hover:bg-black/60 hover:text-white/80"
                    }`}
                    aria-label={media.animatePhoto ? "Disable animation" : "Enable animation"}
                  >
                    <Sparkles className="h-2 w-2" />
                    {media.animatePhoto ? "Animated" : "Animate"}
                  </button>
                )}

                {/* Drag handle */}
                <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="h-3.5 w-3.5 text-white/70" />
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(media.id);
                  }}
                  className="absolute right-1.5 bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/80 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500"
                  aria-label={`Remove ${media.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {/* Add more button */}
            {state.mediaFiles.length < MAX_FILES && (
              <button
                onClick={() => inputRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-white/10 text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                aria-label="Add more files"
              >
                <Plus className="h-8 w-8" />
              </button>
            )}
          </div>

          {/* Secondary drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            className={`mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed py-3 transition-all ${
              isDragging
                ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]"
                : "border-white/10 text-[var(--text-tertiary)] hover:border-white/20 hover:text-[var(--text-secondary)]"
            }`}
          >
            <Upload className="h-4 w-4" />
            <span className="text-xs">
              {isDragging ? "Drop files here" : "Drag & drop or click to add more files"}
            </span>
          </div>

          {/* ── Style Presets ── */}
          <div className="mt-5">
            <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <Sparkles className="h-3 w-3 text-[var(--accent)]" />
              Style
              <span className="text-[var(--text-tertiary)]">— or type your own below</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    activePreset === preset.label
                      ? "bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(124,58,237,0.4)]"
                      : "bg-white/5 text-[var(--text-secondary)] border border-white/10 hover:border-[var(--accent)]/40 hover:text-white"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={activePreset ? "" : state.creativeDirection}
              onChange={(e) => {
                const value = e.target.value.slice(0, 300);
                setActivePreset(null);
                dispatch({ type: "SET_CREATIVE_DIRECTION", direction: value });
              }}
              placeholder={activePreset ? `Using "${activePreset}" style` : "Or describe your own vibe..."}
              disabled={!!activePreset}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-[var(--text-tertiary)] outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-50"
            />
          </div>

          {/* ── Pro Features ── */}
          <div className="mt-5">
            <div className="mb-2.5 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <Crown className="h-3 w-3 text-purple-400" />
                Pro Features
              </label>
              {proFeaturesEnabled > 0 && (
                <span className="text-[10px] text-purple-300">{proFeaturesEnabled} enabled</span>
              )}
            </div>

            <div className="space-y-2">
              <ProToggle
                icon={Music}
                label="AI Music"
                description="Custom instrumental soundtrack"
                enabled={state.aiMusicEnabled}
                onToggle={() => dispatch({ type: "SET_AI_MUSIC_ENABLED", enabled: !state.aiMusicEnabled })}
                iconColor="text-purple-400"
              />
              <ProToggle
                icon={Volume2}
                label="Sound Effects"
                description="AI-generated SFX synced to clips"
                enabled={state.sfxEnabled}
                onToggle={() => dispatch({ type: "SET_SFX_ENABLED", enabled: !state.sfxEnabled })}
                iconColor="text-blue-400"
              />
              <ProToggle
                icon={Video}
                label="Intro & Outro Cards"
                description="AI-generated animated title cards"
                enabled={state.introOutroEnabled}
                onToggle={() => dispatch({ type: "SET_INTRO_OUTRO_ENABLED", enabled: !state.introOutroEnabled })}
                iconColor="text-pink-400"
              />
              {photoCount > 0 && (
                <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] border border-white/5 px-4 py-3">
                  <Sparkles className="h-4 w-4 text-yellow-400" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-white">Photo Animation</span>
                      <span className="rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/20 px-1.5 py-0.5 text-[9px] font-medium text-purple-300">
                        <Crown className="inline h-2 w-2 mr-0.5 -mt-px" />PRO
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)]">
                      Tap &quot;Animate&quot; on each photo above to bring it to life
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Voice clone */}
          <div className="mt-2 rounded-xl bg-white/[0.03] border border-white/5 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Mic className="h-4 w-4 text-emerald-400" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white">Voice Clone</span>
                    <span className="rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/20 px-1.5 py-0.5 text-[9px] font-medium text-purple-300">
                      <Crown className="inline h-2 w-2 mr-0.5 -mt-px" />PRO
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    AI narrates in your voice + creates a talking head intro
                  </p>
                </div>
              </div>
              {state.voiceSampleUrl && (
                <button
                  onClick={() => dispatch({ type: "SET_VOICE_SAMPLE", url: null })}
                  className="text-xs text-red-400/60 hover:text-red-400"
                >
                  Remove
                </button>
              )}
            </div>
            {state.voiceSampleUrl ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/10 p-2">
                <Mic className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-300">Voice sample ready — AI will clone your voice and create a talking head intro</span>
              </div>
            ) : (
              <button
                onClick={() => voiceInputRef.current?.click()}
                disabled={voiceUploading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-500/20 bg-white/[0.02] px-4 py-2 text-xs text-[var(--text-tertiary)] transition-colors hover:border-emerald-400/40 hover:text-emerald-300 disabled:opacity-50"
              >
                {voiceUploading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing...</>
                ) : (
                  <><Upload className="h-3.5 w-3.5" /> Upload 10-30s voice sample (MP3, WAV, M4A)</>
                )}
              </button>
            )}
          </div>
          <input
            ref={voiceInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleVoiceSample(file);
              e.target.value = "";
            }}
          />

          {/* CTA */}
          <button
            onClick={handleContinue}
            className="btn-primary group mt-5 flex w-full items-center justify-center gap-2 animate-pulse-glow-subtle"
          >
            <Wand2 className="h-4 w-4 transition-transform group-hover:rotate-12" />
            <span>Create Highlight Tape</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <p className="text-center text-[10px] text-[var(--text-tertiary)] mt-1">
            AI will analyze your footage and create a complete edit in ~2 minutes
          </p>
        </div>
      )}

      {/* Drop zone — empty state */}
      {!hasFiles && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          aria-label="Upload video and photo files"
          className={`glass-card group flex w-full max-w-md cursor-pointer flex-col items-center gap-5 p-10 transition-all duration-300 ${
            isDragging
              ? "scale-[1.02] border-[var(--accent)] shadow-[0_0_30px_rgba(124,58,237,0.3)]"
              : "hover:border-white/20 hover:shadow-[0_0_20px_rgba(124,58,237,0.1)]"
          }`}
        >
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300 ${
              isDragging
                ? "bg-[var(--accent)] scale-110 rotate-3"
                : "bg-white/10 group-hover:bg-white/15 group-hover:scale-105"
            }`}
          >
            {isDragging ? (
              <Film className="h-8 w-8 text-white animate-pulse" />
            ) : (
              <Upload className="h-8 w-8 text-[var(--text-secondary)] transition-transform group-hover:-translate-y-0.5" />
            )}
          </div>

          <div className="text-center">
            <p className="font-semibold text-white">
              {isDragging ? "Drop your files here" : "Drag & drop videos + photos"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              or <span className="text-[var(--accent)] underline underline-offset-2">click to browse</span> — MP4, MOV, WebM, JPG, PNG
            </p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-white/10 px-1.5 text-[10px] font-medium">{MAX_FILES}</span>
              files max · {MAX_UPLOAD_SIZE_MB} MB each
            </p>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/*,image/jpeg,image/png,image/webp,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
          }
          e.target.value = "";
        }}
      />

      {/* Feature bullets — empty state */}
      {!hasFiles && (
        <div className="grid grid-cols-1 gap-2 text-sm text-[var(--text-secondary)] md:grid-cols-3 w-full max-w-lg">
          {[
            { icon: Wand2, label: "AI picks the best moments" },
            { icon: Sparkles, label: "Smart transitions & effects" },
            { icon: Crown, label: "Pro: music, SFX, intros & more" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("Could not read video"));
    video.src = url;
  });
}
