"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Film, AlertCircle, X, Image, Plus, ArrowRight, GripVertical, Sparkles, Music, Mic, Loader2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { MAX_UPLOAD_SIZE_MB, MAX_VIDEO_DURATION_SECONDS, MAX_FILES, PHOTO_DISPLAY_DURATION } from "@/lib/constants";
import { formatFileSize, haptic, uuid } from "@/lib/utils";
import { clearDetectionCache } from "@/lib/detection-cache";
import type { MediaFile } from "@/lib/types";

export default function UploadStep() {
  const { state, dispatch } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const dragItemIndex = useRef<number | null>(null);

  const hasFiles = state.mediaFiles.length > 0;

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
          // Check video duration
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
    // Clear stale replan state so we always run full detection from upload
    dispatch({ type: "SET_REGENERATE_FEEDBACK", feedback: null });
    clearDetectionCache();
    dispatch({ type: "SET_STEP", step: "detecting" });
  };

  const handleRemove = (fileId: string) => {
    dispatch({ type: "REMOVE_MEDIA", fileId });
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
      // Store as data URI for display + later upload to clone API
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read voice sample"));
        reader.readAsDataURL(file);
      });
      dispatch({ type: "SET_VOICE_SAMPLE", url: dataUri });
    } catch {
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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 animate-fade-in">
      {/* Hero text — scales down once files are added to shift focus to content */}
      <div className="text-center">
        {hasFiles ? (
          <>
            <h1 className="mb-1 text-2xl font-bold leading-tight md:text-3xl">
              Your media is ready
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Drag to reorder, add more, or hit continue.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-3 text-4xl font-bold leading-tight md:text-5xl">
              Turn raw footage into{" "}
              <span className="bg-accent-gradient bg-clip-text text-transparent">viral Reels</span>
            </h1>
            <p className="mx-auto max-w-md text-[var(--text-secondary)]">
              Upload videos & photos — AI finds the best moments and creates one highlight tape.
            </p>
          </>
        )}
      </div>

      {/* Error — placed high so it's immediately visible */}
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
              <div key={media.id} className="flex flex-col gap-1.5">
                <div
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

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                  {/* Type badge + duration */}
                  <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
                    {media.type === "video" ? <Film className="h-2.5 w-2.5" /> : <Image className="h-2.5 w-2.5" />}
                    {media.type === "video" ? `${Math.round(media.duration)}s` : "Photo"}
                  </div>

                  {/* Order number */}
                  <div className="absolute bottom-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">
                    {index + 1}
                  </div>

                  {/* Drag handle — visible on hover */}
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

                {/* Photo animation controls — improved sizing and touch targets */}
                {media.type === "photo" && (
                  <label className="flex items-center gap-1.5 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={media.animatePhoto ?? false}
                      onChange={(e) => {
                        dispatch({
                          type: "UPDATE_MEDIA_ANIMATION",
                          fileId: media.id,
                          animatePhoto: e.target.checked,
                          animationInstructions: media.animationInstructions ?? "",
                        });
                      }}
                      className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-[var(--accent)]"
                    />
                    <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                    <span className="text-[11px] text-[var(--text-secondary)]">Animate</span>
                  </label>
                )}
                {media.type === "photo" && media.animatePhoto && (
                  <input
                    type="text"
                    value={media.animationInstructions ?? ""}
                    onChange={(e) => {
                      dispatch({
                        type: "UPDATE_MEDIA_ANIMATION",
                        fileId: media.id,
                        animatePhoto: true,
                        animationInstructions: e.target.value.slice(0, 500),
                      });
                    }}
                    placeholder="e.g. slow zoom in..."
                    className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                  />
                )}
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

          {/* Secondary drop zone — always visible when files exist */}
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

          {/* Creative direction */}
          <div className="mt-5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <Sparkles className="h-3 w-3 text-[var(--accent)]" />
              Creative direction
            </label>
            <input
              type="text"
              value={state.creativeDirection}
              onChange={(e) => {
                const value = e.target.value.slice(0, 300);
                dispatch({ type: "SET_CREATIVE_DIRECTION", direction: value });
              }}
              placeholder="e.g. violet neon theme, cinematic slow-mo, hype energy..."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-[var(--text-tertiary)] outline-none transition-colors focus:border-[var(--accent)]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
              Optional — guide the AI&apos;s editing style and mood
            </p>
          </div>

          {/* AI Music toggle */}
          <div className="mt-4 flex flex-col gap-2 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/10 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium text-white">AI Generated Music</span>
                <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">PRO</span>
              </div>
              <button
                onClick={() => {
                  dispatch({ type: "SET_AI_MUSIC_ENABLED", enabled: !state.aiMusicEnabled });
                  haptic(5);
                }}
                role="switch"
                aria-checked={state.aiMusicEnabled}
                aria-label="Toggle AI generated music"
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  state.aiMusicEnabled ? "bg-[var(--accent)]" : "bg-white/20"
                } cursor-pointer`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    state.aiMusicEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            {state.aiMusicEnabled && (
              <p className="text-[11px] text-[var(--text-tertiary)]">
                AI will compose a custom instrumental soundtrack after your tape is created.
              </p>
            )}
          </div>

          {/* Voice clone sample (Pro) */}
          <div className="mt-4 flex flex-col gap-2 rounded-xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/10 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium text-white">Voice Clone</span>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">PRO</span>
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
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2">
                <Mic className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-emerald-400">Voice sample ready — AI will clone your voice for narration</span>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  Upload a 10-30 second voice sample — AI narrates your tape in your own voice.
                </p>
                <button
                  onClick={() => voiceInputRef.current?.click()}
                  disabled={voiceUploading}
                  className="flex items-center justify-center gap-2 rounded-lg border border-blue-500/20 bg-white/5 px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {voiceUploading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                  ) : (
                    <><Upload className="h-4 w-4" /> Upload Voice Sample</>
                  )}
                </button>
              </>
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

          {/* Continue button */}
          <button
            onClick={handleContinue}
            className="btn-primary mt-5 flex w-full items-center justify-center gap-2"
          >
            <span>Create Highlight Tape</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Drop zone — shown when no files yet */}
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
          className={`glass-card flex w-full max-w-md cursor-pointer flex-col items-center gap-4 p-10 transition-all ${
            isDragging
              ? "scale-[1.02] border-[var(--accent)] shadow-[0_0_30px_rgba(124,58,237,0.3)]"
              : "hover:border-white/20"
          }`}
        >
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${
              isDragging ? "bg-[var(--accent)]" : "bg-white/10"
            }`}
          >
            {isDragging ? (
              <Film className="h-8 w-8 text-white" />
            ) : (
              <Upload className="h-8 w-8 text-[var(--text-secondary)]" />
            )}
          </div>

          <div className="text-center">
            <p className="font-semibold text-white">
              {isDragging ? "Drop your files here" : "Drag & drop videos + photos"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              or click to browse — MP4, MOV, WebM, JPG, PNG up to {MAX_UPLOAD_SIZE_MB} MB each
            </p>
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              Up to {MAX_FILES} files — AI creates one highlight tape from all of them
            </p>
          </div>
        </div>
      )}

      {/* Hidden file input (supports multiple) */}
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
          // Reset so the same files can be selected again
          e.target.value = "";
        }}
      />

      {/* Feature bullets — only shown in empty state as social proof */}
      {!hasFiles && (
        <div className="grid grid-cols-1 gap-3 text-sm text-[var(--text-secondary)] md:grid-cols-3">
          {[
            "AI-powered highlight tape",
            "TikTok & Reels ready",
            "Multi-clip smart editing",
          ].map((label) => (
            <div key={label} className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2">
              <div className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              {label}
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
