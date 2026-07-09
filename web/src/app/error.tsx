"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-primary)] px-4 text-center">
      <h2 className="mb-4 text-2xl font-bold text-[var(--text-primary)]">
        Something went wrong
      </h2>
      <p className="mb-6 max-w-md text-[var(--text-secondary)]">
        An unexpected error occurred. You can try again or refresh the page.
      </p>
      <button onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
