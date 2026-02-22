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
 * The final result (or error) is sent as an SSE event once the planner finishes.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { frames, scores, templateName, userFeedback } = body;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("event: keepalive\ndata: {}\n\n"));
        } catch {
          // Controller closed — stop pinging
          clearInterval(keepalive);
        }
      }, 15_000);

      try {
        const result = await planFromScores(
          frames,
          scores,
          templateName ?? undefined,
          userFeedback ?? undefined
        );
        clearInterval(keepalive);
        controller.enqueue(
          encoder.encode(`event: result\ndata: ${JSON.stringify(result)}\n\n`)
        );
      } catch (err) {
        clearInterval(keepalive);
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
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
