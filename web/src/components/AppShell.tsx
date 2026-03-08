"use client";

import { useApp } from "@/lib/store";
import { useRef, useEffect, useState } from "react";
import { Upload, Sparkles, LayoutList, Clapperboard, Download } from "lucide-react";
import Header from "./Header";
import UploadStep from "./steps/UploadStep";
import DetectingStep from "./steps/DetectingStep";
import ResultsStep from "./steps/ResultsStep";
import EditorStep from "./steps/EditorStep";
import ExportStep from "./steps/ExportStep";
import Footer from "./Footer";
import type { AppStep } from "@/lib/types";

const STEPS: { key: AppStep; label: string; icon: typeof Upload }[] = [
  { key: "upload", label: "Upload", icon: Upload },
  { key: "detecting", label: "Analyze", icon: Sparkles },
  { key: "results", label: "Review", icon: LayoutList },
  { key: "editor", label: "Edit", icon: Clapperboard },
  { key: "export", label: "Export", icon: Download },
];

function StepIndicator({ currentStep }: { currentStep: AppStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <nav className="mx-auto flex w-full max-w-3xl items-center gap-1 px-4 py-2" aria-label="Progress">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === currentIndex;
        const isCompleted = i < currentIndex;
        return (
          <div key={step.key} className="flex flex-1 items-center gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-300 ${
                isActive
                  ? "bg-[var(--accent)]/20 text-[var(--accent)] shadow-[0_0_8px_rgba(124,58,237,0.2)]"
                  : isCompleted
                    ? "text-emerald-400/80"
                    : "text-[var(--text-tertiary)]"
              }`}
              aria-current={isActive ? "step" : undefined}
            >
              <Icon className={`h-3 w-3 transition-transform duration-300 ${isActive ? "scale-110" : ""}`} />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 mx-0.5">
                <div className="h-px w-full bg-white/10 relative overflow-hidden rounded-full">
                  <div
                    className="absolute inset-y-0 left-0 bg-[var(--accent)]/50 transition-all duration-500 ease-out"
                    style={{ width: isCompleted ? "100%" : isActive ? "50%" : "0%" }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function AppShell() {
  const { state } = useApp();
  const [displayStep, setDisplayStep] = useState(state.step);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevStepRef = useRef(state.step);

  useEffect(() => {
    if (state.step !== prevStepRef.current) {
      setIsTransitioning(true);
      // Short exit animation, then swap content
      const timeout = setTimeout(() => {
        setDisplayStep(state.step);
        setIsTransitioning(false);
      }, 150);
      prevStepRef.current = state.step;
      return () => clearTimeout(timeout);
    }
  }, [state.step]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {state.step !== "upload" && <StepIndicator currentStep={state.step} />}
      <main
        className={`mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-8 pt-4 transition-all duration-200 ${
          isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
        }`}
        role="main"
        aria-live="polite"
      >
        {displayStep === "upload" && <UploadStep />}
        {displayStep === "detecting" && <DetectingStep />}
        {displayStep === "results" && <ResultsStep />}
        {displayStep === "editor" && <EditorStep />}
        {displayStep === "export" && <ExportStep />}
      </main>
      <Footer />
    </div>
  );
}
