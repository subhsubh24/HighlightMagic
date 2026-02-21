"use client";

import { useApp } from "@/lib/store";
import Header from "./Header";
import UploadStep from "./steps/UploadStep";
import PromptStep from "./steps/PromptStep";
import DetectingStep from "./steps/DetectingStep";
import ResultsStep from "./steps/ResultsStep";
import EditorStep from "./steps/EditorStep";
import ExportStep from "./steps/ExportStep";

export default function AppShell() {
  const { state } = useApp();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-8 pt-4">
        {state.step === "upload" && <UploadStep />}
        {state.step === "prompt" && <PromptStep />}
        {state.step === "detecting" && <DetectingStep />}
        {state.step === "results" && <ResultsStep />}
        {state.step === "editor" && <EditorStep />}
        {state.step === "export" && <ExportStep />}
      </main>
    </div>
  );
}
