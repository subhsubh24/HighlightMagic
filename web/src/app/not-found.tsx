import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found — Highlight Magic",
  description: "The page you're looking for doesn't exist or has moved.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-primary)] px-4 text-center">
      <p className="gradient-text text-6xl font-bold tracking-tight">404</p>
      <h1 className="mt-4 text-2xl font-bold text-[var(--text-primary)]">
        This page took a different cut
      </h1>
      <p className="mt-3 max-w-sm text-[var(--text-secondary)]">
        The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back to
        the good stuff.
      </p>
      <Link href="/" className="btn-primary mt-8">
        Back to home
      </Link>
    </div>
  );
}
