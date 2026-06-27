import { CLAUDE_VALIDATOR } from "@/lib/ai-models";
import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { MAX_FILES } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

interface ClipInput {
  captionText: string;
  durationSec: number;
  filter: string;
  transition: string;
  sfxPrompt?: string;
  order: number;
}

interface FrameInput {
  clipIndex: number;
  jpegBase64: string;
}

interface SfxInput {
  clipIndex: number;
  prompt: string;
}

interface VoiceoverSegment {
  clipIndex: number;
  text: string;
}

function buildValidationPrompt(hasFrames: boolean): string {
  const visualChecks = hasFrames
    ? `
## Visual checks (use the frames)
1. **Hook frame** — Clip 0's frame MUST grab attention. Flag if visually weak (static, dark, no clear subject).
2. **Visual variety** — Flag if consecutive clips look nearly identical.
3. **Caption-visual mismatch** — Flag only when a caption clearly contradicts the frame.
4. **Dead clips** — Flag any frame too dark, blurry, or featureless.`
    : "";

  return `You are a quality reviewer for short-form highlight reels (TikTok, Reels, Shorts).

Review the tape and either PASS it or return specific, structured fixes.
${visualChecks}
## Structural checks
1. Hook quality — is the first clip a strong opener?
2. Pacing — energy oscillation, no dead stretches
3. Caption quality — punchy, varied, no clichés, sounds human not AI
4. Narrative arc — build-up, climax, resolution
5. Overall coherence — do captions, transitions, and effects feel cohesive?

## Rules
- PASS if good enough to post — don't be a perfectionist
- Only flag problems that would genuinely hurt engagement
- Every issue MUST include its structured fix
- Prefer free fixes (caption rewrites, clip reordering) over regeneration
- Maximum 3 regeneration requests

## Output format
Return a single JSON object:
{"passed": boolean, "issues": ["description"], "fixes": {"clipUpdates": [{"clipIndex": number, "captionText": "new text"}], "clipRemovals": [number], "regenerateSfx": [{"clipIndex": number, "prompt": "corrected prompt", "durationMs": number}], "regenerateMusic": {"prompt": "new prompt", "durationMs": number}, "regenerateVoiceover": [{"clipIndex": number, "text": "new text"}], "regenerateIntro": {"text": "new text", "stylePrompt": "new style", "duration": number}, "regenerateOutro": {"text": "new text", "stylePrompt": "new style", "duration": number}}}

Only include fix fields that are needed. If passed is true, fixes should be empty.`;
}

function buildTapeDescription(
  clips: ClipInput[],
  contentSummary: string,
  musicPrompt?: string,
  sfx?: SfxInput[],
  voiceover?: { enabled: boolean; segments: VoiceoverSegment[] },
  intro?: { text: string; stylePrompt: string },
  outro?: { text: string; stylePrompt: string }
): string {
  const parts: string[] = [];
  parts.push(`## Content Summary\n${contentSummary || "No summary available"}`);
  parts.push(`\n## Clips (${clips.length} total)`);
  for (const [i, c] of clips.entries()) {
    const caption = c.captionText || "(no caption)";
    parts.push(
      `${i}. "${caption}" [${c.durationSec.toFixed(1)}s] filter=${c.filter} transition=${c.transition}`
    );
  }
  if (musicPrompt) parts.push(`\n## Production Plan\nMusic: "${musicPrompt}"`);
  if (intro) parts.push(`Intro: "${intro.text}"`);
  if (outro) parts.push(`Outro: "${outro.text}"`);
  if (sfx && sfx.length > 0) {
    parts.push(`SFX: ${sfx.map((s) => `clip${s.clipIndex}: "${s.prompt}"`).join(", ")}`);
  }
  if (voiceover?.enabled && voiceover.segments.length > 0) {
    parts.push(
      `Voiceover: ${voiceover.segments.map((s) => `clip${s.clipIndex}: "${s.text}"`).join(", ")}`
    );
  }
  return parts.join("\n");
}

/**
 * POST /api/ios-validate
 *
 * Haiku QA pass on an assembled iOS highlight tape. Mirrors the web /api/validate endpoint.
 * Fail-open: returns passed=true on any error. Does NOT consume quota — validation is a
 * sub-step of the export whose quota was already consumed at /api/ios-score.
 *
 * Request:  { userId, clips, contentSummary, musicPrompt?, sfx?, voiceover?, intro?, outro?, clipFrames? }
 * Response: { passed, issues, fixes }
 */
export async function POST(req: Request) {
  // H1: rate limit — this route hits the paid Anthropic API (Haiku), so throttle per-IP
  // to resist request floods even though it does not itself consume export quota.
  const rl = checkRateLimit(`ios-validate:${getClientIP(req)}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, clips, contentSummary, musicPrompt, sfx, voiceover, intro, outro, clipFrames } =
    body as {
      userId: unknown;
      clips: unknown;
      contentSummary: unknown;
      musicPrompt?: string;
      sfx?: SfxInput[];
      voiceover?: { enabled: boolean; segments: VoiceoverSegment[] };
      intro?: { text: string; stylePrompt: string };
      outro?: { text: string; stylePrompt: string };
      clipFrames?: FrameInput[];
    };

  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }
  if (!Array.isArray(clips) || clips.length === 0) {
    return Response.json({ error: "clips must be a non-empty array" }, { status: 400 });
  }
  // H2: bound payload size before the paid Haiku (vision) call. A real reel is well under
  // MAX_FILES clips; an oversized clips/clipFrames array is malformed or abusive.
  if (clips.length > MAX_FILES) {
    return Response.json({ error: "too many clips" }, { status: 400 });
  }
  if (Array.isArray(clipFrames) && clipFrames.length > MAX_FILES) {
    return Response.json({ error: "too many clip frames" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[ios-validate] ANTHROPIC_API_KEY not configured — passing by default");
    return Response.json({ passed: true, issues: [], fixes: {} });
  }

  const typedClips = clips as ClipInput[];
  const typedFrames = Array.isArray(clipFrames) ? (clipFrames as FrameInput[]) : [];
  const hasFrames = typedFrames.length > 0;

  const systemPrompt = buildValidationPrompt(hasFrames);
  const description = buildTapeDescription(
    typedClips,
    typeof contentSummary === "string" ? contentSummary : "",
    musicPrompt,
    sfx,
    voiceover,
    intro,
    outro
  );

  const userContent: object[] = [{ type: "text", text: description }];
  if (hasFrames) {
    userContent.push({
      type: "text",
      text: "\n## Visual Frames (one per clip — verify captions, SFX, and visual quality)",
    });
    for (const frame of typedFrames) {
      const clip = typedClips[frame.clipIndex];
      const caption = clip?.captionText || "(no caption)";
      userContent.push({ type: "text", text: `\nClip ${frame.clipIndex}: "${caption}"` });
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: frame.jpegBase64 },
      });
    }
  }

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: CLAUDE_VALIDATOR,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: AbortSignal.timeout(hasFrames ? 20_000 : 15_000),
    });

    if (!response.ok) {
      console.warn(`[ios-validate] Haiku returned HTTP ${response.status} — passing by default`);
      return Response.json({ passed: true, issues: [], fixes: {} });
    }

    const json = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const textBlock = json.content?.find((b) => b.type === "text");
    const text = textBlock?.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ passed: true, issues: [], fixes: {} });
    }

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return Response.json({ passed: true, issues: [], fixes: {} });
    }

    const passed = typeof result.passed === "boolean" ? result.passed : true;
    const issues = Array.isArray(result.issues) ? result.issues : [];
    const fixes = typeof result.fixes === "object" && result.fixes !== null ? result.fixes : {};

    console.log(
      `[ios-validate] userId=${userId} clips=${typedClips.length} passed=${passed} issues=${issues.length}`
    );

    return Response.json({ passed, issues, fixes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[ios-validate] Error (fail-open): ${message}`);
    return Response.json({ passed: true, issues: [], fixes: {} });
  }
}
