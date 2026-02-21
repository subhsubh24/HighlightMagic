"use client";

import { useState } from "react";
import { Wand2, ArrowLeft, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { TEMPLATES } from "@/lib/templates";
import { formatTime, haptic } from "@/lib/utils";
import type { HighlightTemplate } from "@/lib/types";

const SUGGESTION_CHIPS = [
  "epic scenery & views",
  "funny reactions",
  "best dance moves",
  "action & motion",
  "cozy moments",
  "pet reactions",
];

export default function PromptStep() {
  const { state, dispatch } = useApp();
  const [prompt, setPrompt] = useState(state.userPrompt);
  const [selectedTemplate, setSelectedTemplate] = useState<HighlightTemplate | null>(
    state.selectedTemplate
  );

  const handleDetect = () => {
    haptic();
    dispatch({ type: "SET_PROMPT", prompt });
    dispatch({ type: "SET_TEMPLATE", template: selectedTemplate });
    dispatch({ type: "SET_STEP", step: "detecting" });
  };

  return (
    <div className="flex flex-1 flex-col gap-6 animate-fade-in">
      {/* Back + video info */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: "upload" })}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[var(--text-secondary)] transition-colors hover:bg-white/10"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="font-semibold text-white">{state.videoFile?.name}</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {formatTime(state.videoDuration)} duration
          </p>
        </div>
      </div>

      {/* Video preview */}
      {state.videoUrl && (
        <div className="overflow-hidden rounded-xl">
          <video
            src={state.videoUrl}
            className="aspect-video w-full rounded-xl object-cover"
            controls={false}
            muted
            autoPlay
            loop
            playsInline
          />
        </div>
      )}

      {/* Prompt input */}
      <div className="glass-card p-4">
        <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
          What highlights are you looking for?
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., epic hiking views, funny pet reactions, best dance moves..."
          rows={3}
          className="w-full resize-none rounded-lg bg-white/5 p-3 text-white placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />

        {/* Suggestion chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => {
                setPrompt((prev) => (prev ? `${prev}, ${chip}` : chip));
                haptic(5);
              }}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-white"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Template selector */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">
          Style Template (optional)
        </h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setSelectedTemplate(selectedTemplate?.id === t.id ? null : t);
                haptic(5);
              }}
              className={`flex flex-col items-center gap-1.5 rounded-xl p-3 text-center transition-all ${
                selectedTemplate?.id === t.id
                  ? "border-2 border-[var(--accent)] bg-[var(--accent)]/10 scale-[1.02]"
                  : "border border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                style={{ backgroundColor: `${t.colorAccent}20`, color: t.colorAccent }}
              >
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-xs font-medium text-white">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Detect button */}
      <button onClick={handleDetect} className="btn-primary mt-auto flex items-center justify-center gap-2">
        <Wand2 className="h-5 w-5" />
        Find Highlights
      </button>

      <p className="text-center text-xs text-[var(--text-tertiary)]">
        {prompt.trim()
          ? "AI will prioritize moments matching your description"
          : "Skip the prompt — AI will auto-detect the best moments"}
      </p>
    </div>
  );
}
