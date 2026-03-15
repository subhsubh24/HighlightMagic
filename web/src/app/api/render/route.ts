import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — rendering can be slow

/**
 * Server-side FFmpeg rendering endpoint (Arch #1).
 *
 * Accepts an Edit Decision List (EDL) describing the highlight tape:
 * clips, transitions, filters, captions, audio layers. Renders the final
 * video server-side using FFmpeg, which is 5-10x faster than browser-based
 * Canvas + MediaRecorder rendering.
 *
 * Benefits over client-side rendering:
 * - 5-10x faster (GPU-accelerated encoding, no JS overhead)
 * - User can close the tab — rendering continues server-side
 * - Consistent quality across devices (no mobile throttling)
 * - Supports H.265/HEVC for smaller files
 * - Enables 4K output without melting phones
 *
 * Flow:
 * 1. Client sends EDL + asset URLs
 * 2. Server downloads assets, builds FFmpeg filter graph, renders
 * 3. Returns a job ID for polling (reuses /api/animate/check pattern)
 * 4. Client polls until render completes, then downloads the result
 *
 * Prerequisites:
 * - FFmpeg installed on the server (or Lambda layer)
 * - Sufficient disk/memory for temporary asset storage
 * - Set RENDER_ENABLED=true in environment to activate
 */

interface RenderClip {
  /** Source media URL (video URL or animated photo URL) */
  sourceUrl: string;
  /** Start time in seconds (for video sources) */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** CSS filter string (mapped to FFmpeg filter equivalents) */
  filter?: string;
  /** Transition to apply before this clip */
  transitionType?: string;
  transitionDuration?: number;
  /** Caption overlay */
  captionText?: string;
  captionStyle?: string;
}

interface RenderRequest {
  /** Ordered list of clips forming the highlight tape */
  clips: RenderClip[];
  /** Audio layers (music, SFX, voiceover — mixed by FFmpeg) */
  audioLayers: Array<{
    url: string;
    startTime: number;
    volume: number; // 0.0 - 1.0
    fadeIn?: number;
    fadeOut?: number;
  }>;
  /** Output dimensions */
  width: number;
  height: number;
  /** Target FPS */
  fps: number;
  /** Target bitrate in bps */
  bitrate: number;
  /** Enable seamless loop crossfade */
  seamlessLoop?: boolean;
  /** Watermark text (free tier) */
  watermark?: string;
}

export async function POST(req: Request) {
  // Feature gate — only enable when infrastructure is ready
  if (process.env.RENDER_ENABLED !== "true") {
    return NextResponse.json(
      {
        error: "Server-side rendering is not enabled. Set RENDER_ENABLED=true to activate.",
        fallback: "client",
      },
      { status: 501 }
    );
  }

  try {
    const body: RenderRequest = await req.json();

    // Validate EDL
    if (!Array.isArray(body.clips) || body.clips.length === 0) {
      return NextResponse.json({ error: "clips array is required" }, { status: 400 });
    }
    if (!body.width || !body.height || !body.fps) {
      return NextResponse.json({ error: "width, height, and fps are required" }, { status: 400 });
    }

    // Validate each clip has a source
    for (let i = 0; i < body.clips.length; i++) {
      if (!body.clips[i].sourceUrl) {
        return NextResponse.json({ error: `clips[${i}].sourceUrl is required` }, { status: 400 });
      }
    }

    console.log(`[render] Received EDL: ${body.clips.length} clips, ${body.audioLayers?.length ?? 0} audio layers, ${body.width}x${body.height}@${body.fps}fps`);

    // ── Render worker not yet deployed ──
    // EDL validation above is production-ready. When the FFmpeg render worker
    // is deployed, replace this 501 with job creation + queue submission.
    // The client handles 501 by falling back to client-side Canvas rendering.
    //
    // IMPORTANT: Do NOT return a fake jobId here — the client would poll
    // /api/animate/check with a bogus prediction ID for 5 minutes before
    // timing out and falling back to client-side rendering.
    return NextResponse.json(
      {
        error: "Server-side render worker is not deployed yet.",
        fallback: "client",
      },
      { status: 501 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[render] Error:", message);
    return NextResponse.json({ error: "Render request failed" }, { status: 500 });
  }
}
