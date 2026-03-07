import { planFromScores } from "@/actions/detect";

export const runtime = "nodejs";

/**
 * SSE route handler for the planner.
 *
 * The Opus planner can take 2-5 minutes (effort: "high" + adaptive thinking
 * over 80 images). A server action would leave the client→server connection
 * idle the entire time — browsers and proxies drop idle connections after
 * ~60-120s, causing "Failed to fetch" on the client.
 *
 * This route streams keepalive pings every 15s so the connection stays alive.
 * Phase progress events ("thinking", "generating") are forwarded so the client
 * can show real progress instead of fake timers.
 * The final result (or error) is sent as an SSE event once the planner finishes.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { frames, scores, templateName, userFeedback, creativeDirection, photoAnimations } = body as {
    frames: unknown;
    scores: unknown;
    templateName?: string;
    userFeedback?: string;
    creativeDirection?: string;
    photoAnimations?: Array<{ sourceFileId: string; animatePhoto: boolean; animationInstructions: string }>;
  };

  if (!Array.isArray(frames) || !Array.isArray(scores)) {
    return new Response(JSON.stringify({ error: "frames and scores must be arrays" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  console.log(`[/api/plan] Request received — frames=${(frames as unknown[]).length}, scores=${(scores as unknown[]).length}`);

  const stream = new ReadableStream({
    async start(controller) {
      console.log(`[/api/plan] Stream started, calling planFromScores...`);
      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("event: keepalive\ndata: {}\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      const planStartMs = Date.now();
      try {
        const result = await planFromScores(
          frames,
          scores,
          templateName ?? undefined,
          userFeedback ?? undefined,
          creativeDirection ?? undefined,
          (phase) => {
            console.log(`[/api/plan] Phase: ${phase} (+${((Date.now() - planStartMs) / 1000).toFixed(1)}s)`);
            try {
              controller.enqueue(
                encoder.encode(`event: phase\ndata: ${JSON.stringify({ phase })}\n\n`)
              );
            } catch {
              // Controller closed — ignore
            }
          },
          photoAnimations ?? undefined
        );
        console.log(`[/api/plan] planFromScores complete — ${result.clips.length} clips in ${((Date.now() - planStartMs) / 1000).toFixed(1)}s`);
        clearInterval(keepalive);
        controller.enqueue(
          encoder.encode(`event: result\ndata: ${JSON.stringify(result)}\n\n`)
        );
      } catch (err) {
        console.error(`[/api/plan] planFromScores FAILED after ${((Date.now() - planStartMs) / 1000).toFixed(1)}s:`, err instanceof Error ? err.message : err);
        clearInterval(keepalive);
        const message = err instanceof Error ? err.message : String(err);
        try {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message })}\n\n`
            )
          );
        } catch {
          // Controller already closed — ignore
        }
      } finally {
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
      }
    },
    cancel() {
      // Client disconnected — clean up keepalive immediately
      clearInterval(keepalive);
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
