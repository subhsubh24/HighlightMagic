import { planFromScores } from "@/actions/detect";
import { checkExportAllowed } from "@/lib/entitlement";

import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * SSE route handler for the planner.
 *
 * The Sonnet planner can take 1-3 minutes (adaptive thinking). A server action
 * would leave the client→server connection idle the entire time — browsers and
 * proxies drop idle connections after ~60-120s, causing "Failed to fetch".
 *
 * This route streams keepalive pings every 15s so the connection stays alive.
 * Phase progress events ("thinking", "generating") are forwarded so the client
 * can show real progress instead of fake timers.
 * The final result (or error) is sent as an SSE event once the planner finishes.
 *
 * P0: requires userId + enforces freemium quota server-side before any paid call.
 */
export async function POST(req: Request) {
  // H1: per-IP rate limit — this route triggers a paid API call, so throttle
  // request floods even before the quota gate (Track H1).
  const rl = checkRateLimit(`plan:${getClientIP(req)}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (e) {
    console.warn("[Plan API] Invalid JSON body:", e);
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { userId, signedTransaction, frames, scores, templateName, userFeedback, creativeDirection, photoAnimations, disabledFeatures, aiDecideAnimations } = body as {
    userId?: unknown;
    signedTransaction?: unknown;
    frames: unknown;
    scores: unknown;
    templateName?: string;
    userFeedback?: string;
    creativeDirection?: string;
    photoAnimations?: Array<{ sourceFileId: string; animatePhoto: boolean; animationInstructions: string }>;
    disabledFeatures?: { music?: boolean; sfx?: boolean; introOutro?: boolean };
    aiDecideAnimations?: boolean;
  };

  if (!userId || typeof userId !== "string") {
    return new Response(JSON.stringify({ error: "userId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(frames) || !Array.isArray(scores)) {
    return new Response(JSON.stringify({ error: "frames and scores must be arrays" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── SERVER-SIDE GATE — before any paid call ──
  const decision = await checkExportAllowed({
    userId,
    signedTransaction: typeof signedTransaction === "string" ? signedTransaction : null,
  });
  if (!decision.allowed) {
    return new Response(
      JSON.stringify({ error: decision.reason ?? "quota exceeded", remaining: 0, limit: decision.limit, upgrade: !decision.isPro }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("event: keepalive\ndata: {}\n\n"));
        } catch (e) {
          console.warn("[Plan API] Keepalive enqueue failed (client disconnected?):", e);
          clearInterval(keepalive);
        }
      }, 15_000);

      try {
        const result = await planFromScores(
          frames,
          scores,
          templateName ?? undefined,
          userFeedback ?? undefined,
          creativeDirection ?? undefined,
          disabledFeatures ?? undefined,
          (phase) => {
            try {
              controller.enqueue(
                encoder.encode(`event: phase\ndata: ${JSON.stringify({ phase })}\n\n`)
              );
            } catch {
              // Controller closed — ignore
            }
          },
          photoAnimations ?? undefined,
          (field, value) => {
            // Forward early production plan fields to client
            try {
              controller.enqueue(
                encoder.encode(`event: partial\ndata: ${JSON.stringify({ field, value })}\n\n`)
              );
            } catch {
              // Controller closed — ignore
            }
          },
          aiDecideAnimations ?? undefined
        );
        clearInterval(keepalive);
        controller.enqueue(
          encoder.encode(`event: result\ndata: ${JSON.stringify(result)}\n\n`)
        );
      } catch (err) {
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
