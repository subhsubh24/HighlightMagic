import { CLAUDE_FRAME_SCORER, estimateCostUSD } from "@/lib/ai-models";
import { checkExportAllowed, consumeExport } from "@/lib/entitlement";
import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { checkDailySpendCeiling, recordDailyExport } from "@/lib/spend-ceiling";
import { anyFrameOverLimit, MAX_FRAME_B64_CHARS, tooLargeResponse } from "@/lib/input-bounds";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * iOS frame-scoring PROXY (ROADMAP P0).
 *
 * The iOS app must NOT call api.anthropic.com directly with an embedded key. It POSTs frames
 * here; the BUSINESS holds the key server-side and pays the bill. This route enforces the
 * freemium quota + Pro entitlement SERVER-SIDE BEFORE the paid call, so a tampered client
 * cannot run up the API bill or bypass the limit. Cost is metered; quota consumed on success.
 *
 * Body: { userId: string, signedTransaction?: string,
 *         frames: [{ timeSec: number, jpegBase64: string }], prompt?: string }
 * 200 → { scores: [{ timeSec, score }], remaining }
 * 400 → bad input · 402 → quota exceeded · 503 → server key not configured
 */

/** Defensive cap so a tampered client can't push an oversized (expensive) batch. */
const MAX_FRAMES = 120;

export async function POST(req: Request) {
  let body: {
    userId?: string;
    signedTransaction?: string;
    frames?: Array<{ timeSec?: number; jpegBase64?: string }>;
    prompt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Track H1: rate limit per IP
  const ip = getClientIP(req);
  const rl = checkRateLimit(`score:${ip}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  const { userId, signedTransaction, prompt } = body;
  const frames = Array.isArray(body.frames) ? body.frames : [];
  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }
  if (frames.length === 0 || !frames.every((f) => typeof f?.jpegBase64 === "string" && typeof f?.timeSec === "number")) {
    return Response.json({ error: "frames must be a non-empty array of { timeSec, jpegBase64 }" }, { status: 400 });
  }
  // H2: bound per-frame payload — cost scales with each base64 image sent to the vision model.
  if (anyFrameOverLimit(frames, "jpegBase64", MAX_FRAME_B64_CHARS)) return tooLargeResponse();

  // ── SERVER-SIDE GATE — before any paid call ──
  const decision = await checkExportAllowed({ userId, signedTransaction });
  if (!decision.allowed) {
    return Response.json(
      { error: decision.reason ?? "quota exceeded", remaining: 0, limit: decision.limit, upgrade: !decision.isPro },
      { status: 402 },
    );
  }

  // Track H7: daily spend ceiling (per-user circuit-breaker, applies to all tiers)
  const ceiling = checkDailySpendCeiling(userId);
  if (!ceiling.allowed) {
    return Response.json(
      { error: "Daily export limit reached. Please try again tomorrow." },
      { status: 429 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "scoring is not configured" }, { status: 503 });
  }

  // Cap batch size defensively (cost control). Shape is validated above.
  const batch = frames.slice(0, MAX_FRAMES) as Array<{ timeSec: number; jpegBase64: string }>;

  const scoringPrompt =
    (prompt && typeof prompt === "string" && prompt.trim().length > 0
      ? `User is looking for: "${prompt.trim()}". `
      : "") +
    `You are scoring video frames for how strong a highlight moment each is. ` +
    `The frames are in order; frame i corresponds to timeSec ${batch.map((f) => f.timeSec).join(", ")}. ` +
    `Return ONLY a JSON array, one object per frame in order: ` +
    `[{"time": <the frame's timeSec>, "score": <0.0-1.0>}]. ` +
    `Higher = more compelling (clear subject, action, emotion, motion). No prose.`;

  const content: Array<Record<string, unknown>> = [{ type: "text", text: scoringPrompt }];
  for (const f of batch) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: f.jpegBase64 },
    });
  }

  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_FRAME_SCORER,
        max_tokens: 2048,
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return Response.json({ error: "scoring upstream unavailable" }, { status: 502 });
  }

  if (!resp.ok) {
    return Response.json({ error: `scoring failed (${resp.status})` }, { status: 502 });
  }

  const data = await resp.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const usageIn = data?.usage?.input_tokens ?? 0;
  const usageOut = data?.usage?.output_tokens ?? 0;
  console.log(
    `[CostMeter] score(proxy): user=${userId} model=${CLAUDE_FRAME_SCORER} in=${usageIn} out=${usageOut} ` +
      `est=$${estimateCostUSD(CLAUDE_FRAME_SCORER, usageIn, usageOut).toFixed(4)}`,
  );

  // Parse the JSON array; tolerate fenced/wrapped output. Fall back to neutral scores.
  let scores: Array<{ timeSec: number; score: number }>;
  try {
    const match = text.match(/\[[\s\S]*\]/);
    const parsed: Array<{ time?: number; score?: number }> = match ? JSON.parse(match[0]) : [];
    scores = batch.map((f, i) => {
      const p = parsed[i];
      const raw = typeof p?.score === "number" ? p.score : 0.5;
      return { timeSec: f.timeSec, score: Math.min(1, Math.max(0, raw)) };
    });
  } catch {
    scores = batch.map((f) => ({ timeSec: f.timeSec, score: 0.5 }));
  }

  // Paid call succeeded → consume one quota unit (no-op for Pro).
  await consumeExport({ userId, isPro: decision.isPro });
  recordDailyExport(userId);

  return Response.json({
    scores,
    remaining: decision.isPro ? -1 : Math.max(0, decision.remaining - 1),
  });
}
