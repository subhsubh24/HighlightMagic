import { WifiOff } from "lucide-react";
import { IOS_APP_STORE_URL } from "@/lib/constants";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <WifiOff className="h-16 w-16 text-[var(--text-tertiary)]" />
      <h1 className="text-2xl font-bold text-white">You&apos;re Offline</h1>
      <p className="max-w-sm text-[var(--text-secondary)]">
        Highlight Magic needs an internet connection for AI video analysis. Please reconnect and try again.
      </p>
      <p className="text-sm text-[var(--text-tertiary)]">
        Want offline AI? Get the{" "}
        <a
          href={IOS_APP_STORE_URL}
          className="text-[var(--accent)] underline"
        >
          iOS app
        </a>{" "}
        for 100% on-device processing.
      </p>
    </div>
  );
}
