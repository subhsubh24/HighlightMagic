"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Film, AlertCircle } from "lucide-react";
import { useApp } from "@/lib/store";
import { MAX_UPLOAD_SIZE_MB, MAX_VIDEO_DURATION_SECONDS } from "@/lib/constants";
import { formatFileSize, haptic } from "@/lib/utils";

export default function UploadStep() {
  const { dispatch } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    (file: File) => {
      setError(null);

      // Validate type
      if (!file.type.startsWith("video/")) {
        setError("Please select a video file (MP4, MOV, WebM).");
        return;
      }

      // Validate size
      if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
        setError(`File too large. Maximum size is ${MAX_UPLOAD_SIZE_MB} MB.`);
        return;
      }

      // Load video to check duration
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        if (video.duration > MAX_VIDEO_DURATION_SECONDS) {
          setError(`Video too long. Maximum duration is ${MAX_VIDEO_DURATION_SECONDS / 60} minutes.`);
          URL.revokeObjectURL(url);
          return;
        }
        haptic();
        dispatch({ type: "SET_VIDEO", file, url, duration: video.duration });
        dispatch({ type: "SET_STEP", step: "detecting" });
      };
      video.onerror = () => {
        setError("Could not read this video file. Try a different format.");
        URL.revokeObjectURL(url);
      };
      video.src = url;
    },
    [dispatch]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 animate-fade-in">
      {/* Hero text */}
      <div className="text-center">
        <h1 className="mb-3 text-4xl font-bold leading-tight md:text-5xl">
          Turn raw footage into{" "}
          <span className="bg-accent-gradient bg-clip-text text-transparent">viral Reels</span>
        </h1>
        <p className="mx-auto max-w-md text-[var(--text-secondary)]">
          Upload a video and AI automatically finds the best moments in seconds.
        </p>
      </div>

      {/* Drop zone */}
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
        aria-label="Upload video file"
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
            {isDragging ? "Drop your video here" : "Drag & drop a video"}
          </p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            or click to browse — MP4, MOV, WebM up to {MAX_UPLOAD_SIZE_MB} MB
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Feature bullets */}
      <div className="grid grid-cols-1 gap-3 text-sm text-[var(--text-secondary)] md:grid-cols-3">
        {[
          ["Sparkles", "AI-powered detection"],
          ["Smartphone", "TikTok & Reels ready"],
          ["Shield", "Privacy-first processing"],
        ].map(([, label]) => (
          <div key={label} className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2">
            <div className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
