import { ImageResponse } from "next/og";

/**
 * Open Graph / social share card for the landing page (Twitter/X `summary_large_image`,
 * Facebook/LinkedIn/Discord link previews). Next auto-wires this into the route's `openGraph.images`
 * and `twitter.images` (twitter-image.tsx re-exports it), which were previously EMPTY — so shared
 * links rendered no preview card at all.
 *
 * Rendered at build/request time from the brand kit spec (docs/brand-kit.md §5): deep-violet bg with
 * a center-left purple glow, the gradient sparkle mark, the wordmark + tagline, an honest abstract
 * vertical-clip motif (NOT a fabricated app screenshot), and the signature gradient bar on top edge.
 * All brand values mirror globals.css / brand-kit.md so the card matches the live site.
 */
export const alt = "Highlight Magic — AI turns your raw video into share-ready vertical highlights";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0F0A1A";
const ACCENT = "#7C3AED";
const PINK = "#EC4899";
const GRADIENT = `linear-gradient(135deg, ${ACCENT} 0%, ${PINK} 100%)`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: BG,
          fontFamily: "sans-serif",
        }}
      >
        {/* center-left purple glow */}
        <div
          style={{
            position: "absolute",
            top: -160,
            left: -120,
            width: 720,
            height: 720,
            background: `radial-gradient(circle, rgba(124,58,237,0.45) 0%, rgba(124,58,237,0) 70%)`,
            display: "flex",
          }}
        />
        {/* signature gradient bar along the top edge */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: GRADIENT, display: "flex" }} />

        {/* Left column: mark + wordmark + tagline + availability */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 28,
            padding: "0 64px",
            width: 720,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {/* gradient sparkle mark */}
            <div
              style={{
                width: 108,
                height: 108,
                borderRadius: 26,
                background: GRADIENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="60" height="60" viewBox="0 0 24 24" fill="white">
                <path d="M12 0 L14 8.5 L22.5 10.5 L14 13 L12 22 L10 13 L1.5 10.5 L10 8.5 Z" />
              </svg>
            </div>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 800, color: "#FFFFFF", letterSpacing: -1 }}>
              Highlight Magic
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.2 }}>
            AI finds your best moments. You share the highlights.
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.7)", lineHeight: 1.35 }}>
            Turn raw footage into polished 1080×1920 clips for TikTok, Reels & Shorts.
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
            iOS · Free to start
          </div>
        </div>

        {/* Right: honest abstract vertical-clip motif */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: 300,
              height: 500,
              borderRadius: 40,
              background: "#1A1128",
              border: "2px solid rgba(124,58,237,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 30px 80px rgba(124,58,237,0.35)",
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 999,
                background: GRADIENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
                <path d="M8 5 L8 19 L19 12 Z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
