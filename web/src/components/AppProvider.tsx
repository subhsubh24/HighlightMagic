"use client";

import { useReducer, useEffect, useRef, type ReactNode } from "react";
import { AppContext, initialState, reducer } from "@/lib/store";
import { clearDetectionCache } from "@/lib/detection-cache";

export default function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const prevStepRef = useRef(state.step);

  // Clear detection cache when returning to upload (RESET action)
  useEffect(() => {
    if (prevStepRef.current !== "upload" && state.step === "upload") {
      clearDetectionCache();
    }
    prevStepRef.current = state.step;
  }, [state.step]);

  return (
    <AppContext value={{ state, dispatch }}>
      {children}
    </AppContext>
  );
}
