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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 text-center">
      <h2 className="mb-4 text-2xl font-bold text-white">
        Something went wrong
      </h2>
      <p className="mb-6 max-w-md text-gray-400">
        An unexpected error occurred. You can try again or refresh the page.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-violet-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-violet-500"
      >
        Try again
      </button>
    </div>
  );
}
