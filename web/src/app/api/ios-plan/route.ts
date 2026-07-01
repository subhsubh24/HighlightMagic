import { planFromScores } from "@/actions/detect";
import { checkExportAllowed } from "@/lib/entitlement";
import { enforceGenerationCeiling } from "@/lib/spend-ceiling";
import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { MAX_DIRECTION_CHARS, overStringLimit, tooLargeResponse } from "@/lib/input-bounds";

export const runtime = "nodejs";
export const maxDuration = 300;

interface IOSFrame {
  timeSec: number;
  jpegBase64: string;
}

interface IOSScore {
  timeSec: number;
  score: number;
  label: string;
  role?: string;
}

/**
 * POST /api/ios-plan
 *
 * iOS tape-planning proxy. Accepts iOS-format scored frames and routes them through
 * the Opus planner on the backend — keeping the API key server-side.
 *
 * Does NOT consume quota (quota consumed at /api/ios-score; planning is a sub-step).
 * Still checks checkExportAllowed so only eligible users can plan.
 *
 * Request:  { userId, frames: [{timeSec, jpegBase64}], scores: [{timeSec, score, label, role?}],
 *             totalSeconds?, templateName?, userFeedback?, creativeDirection? }
 * Response: DetectionResult JSON (clips, productionPlan, detectedTheme, contentSummary)
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ip = getClientIP(req);
  const rl = checkRateLimit(`ios-plan:${ip}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  const { userId, signedTransaction, frames, scores, templateName, userFeedback, creativeDirection } =
    body as {
      userId: unknown;
      signedTransaction?: unknown;
      frames: unknown;
      scores: unknown;
      templateName?: unknown;
      userFeedback?: unknown;
      creativeDirection?: unknown;
    };

  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }
  if (!Array.isArray(frames) || frames.length === 0) {
    return Response.json({ error: "frames must be a non-empty array" }, { status: 400 });
  }
  if (!Array.isArray(scores) || scores.length === 0) {
    return Response.json({ error: "scores must be a non-empty array" }, { status: 400 });
  }
  // H2: bound the free-text steering fields fed to the Claude planner (cost scales per token).
  if (
    overStringLimit(creativeDirection, MAX_DIRECTION_CHARS) ||
    overStringLimit(userFeedback, MAX_DIRECTION_CHARS)
  ) {
    return tooLargeResponse();
  }

  // ── SERVER-SIDE GATE — before any paid call ──
  const decision = await checkExportAllowed({
    userId,
    signedTransaction: typeof signedTransaction === "string" ? signedTransaction : null,
  });
  if (!decision.allowed) {
    return Response.json(
      { error: decision.reason ?? "quota exceeded", remaining: 0, limit: decision.limit, upgrade: !decision.isPro },
      { status: 402 }
    );
  }

  // Map iOS frames → MultiFrameInput[]
  const typedFrames = frames as IOSFrame[];
  const mappedFrames = typedFrames.map((f) => ({
    sourceFileId: "video",
    sourceFileName: "video",
    sourceType: "video" as const,
    timestamp: f.timeSec,
    base64: f.jpegBase64,
  }));

  // Map iOS scores → ScoredFrame[]
  const typedScores = scores as IOSScore[];
  const mappedScores = typedScores.map((s) => ({
    sourceFileId: "video",
    sourceType: "video" as const,
    timestamp: s.timeSec,
    score: s.score,
    label: s.label,
    narrativeRole: s.role,
  }));

  // H7: per-user daily generation ceiling — wallet-drain backstop independent of the
  // per-IP rate limit and the monthly export quota (this sub-call does not consume it).
  const genBlock = await enforceGenerationCeiling(userId);
  if (genBlock) return genBlock;

  try {
    const result = await planFromScores(
      mappedFrames,
      mappedScores,
      typeof templateName === "string" && templateName ? templateName : undefined,
      typeof userFeedback === "string" && userFeedback ? userFeedback : undefined,
      typeof creativeDirection === "string" && creativeDirection ? creativeDirection : undefined
    );

    console.log(`[ios-plan] userId=${userId} frames=${typedFrames.length} scores=${typedScores.length} clips=${(result as unknown as Record<string, unknown[]>)?.clips?.length ?? "?"}`);

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ios-plan] planFromScores error:", message);
    return Response.json({ error: "Planning failed" }, { status: 502 });
  }
}
