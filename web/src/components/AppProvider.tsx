"use client";

import { useReducer, type ReactNode } from "react";
import { AppContext, initialState, reducer } from "@/lib/store";

export default function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <AppContext value={{ state, dispatch }}>
      {children}
    </AppContext>
  );
}
