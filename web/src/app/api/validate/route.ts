export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Validation endpoint — calls Haiku to review the assembled tape and return structured fixes.
 * Fail-open: any error returns { passed: true } so the pipeline always proceeds.
 */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ passed: true, issues: [], fixes: {} });
    }

    const { clips, plan, contentSummary, assetStatuses } = await req.json();

    if (!clips || !Array.isArray(clips) || clips.length === 0) {
      return Response.json({ passed: true, issues: [], fixes: {} });
    }

    const systemPrompt = `You are a quality validator for short-form highlight reels (TikTok, Reels, Shorts).

You will receive the full assembled tape state: clips with their captions/transitions/filters, the production plan, and asset generation statuses.

Your job is to review the tape and either PASS it or return specific, structured fixes.

## Rules
- PASS if the tape is good enough to post — don't be a perfectionist
- Only flag real problems that would hurt engagement or look broken
- When flagging an issue, you MUST provide the structured fix (not just the problem)
- Prefer plan-layer tweaks (instant, free) over asset regeneration (expensive API calls)
- Only request regeneration when content is genuinely wrong (mismatched SFX prompt, misleading intro text)
- Maximum 3 regeneration requests per response to keep cost bounded
- Never request music regeneration unless it completely mismatches the content mood
- If an asset failed to generate, don't flag it — failures are already handled gracefully by the renderer
- Caption fixes and plan updates are free — use them liberally
- Clip reordering suggestions should be expressed as clipUpdates with new order values

## What to check
1. Hook quality — is the first clip a strong opener?
2. Pacing — energy oscillation, no dead stretches
3. Transition logic — types match energy changes between clips
4. Caption quality — punchy, varied, no clichés
5. Narrative arc — build-up, climax, resolution
6. SFX fit — do prompts match the clip content?
7. Voiceover coherence — does text match what's happening?
8. Intro/outro relevance — does text match the content summary?
9. Audio balance — volume levels make sense

## Output format
Return a single JSON object with this exact schema:
{
  "passed": boolean,
  "issues": ["Human-readable description of each issue"],
  "fixes": {
    "clipUpdates": [{ "clipIndex": number, "updates": { ...partial EditedClip fields } }],
    "clipRemovals": [number],
    "regenerateSfx": [{ "clipIndex": number, "prompt": string, "durationMs": number }],
    "regenerateVoiceover": [{ "clipIndex": number, "text": string }],
    "regenerateIntro": { "text": string, "stylePrompt": string, "duration": number },
    "regenerateOutro": { "text": string, "stylePrompt": string, "duration": number },
    "regenerateMusic": { "prompt": string, "durationMs": number },
    "planUpdates": { ...partial AiProductionPlan fields }
  }
}

Only include fix fields that are needed. Omit empty arrays/objects.
If passed is true, fixes should be empty or omitted.`;

    const tapeDescription = buildTapeDescription(clips, plan, contentSummary, assetStatuses);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: tapeDescription }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.warn(`[validate] Haiku returned ${response.status} — treating as passed`);
      return Response.json({ passed: true, issues: [], fixes: {} });
    }

    const body = await response.json();
    const text = body.content?.[0]?.text ?? "";

    // Extract JSON from response
    const jsonStr = extractJSON(text);
    if (!jsonStr) {
      console.warn("[validate] No JSON in Haiku response — treating as passed");
      return Response.json({ passed: true, issues: [], fixes: {} });
    }

    const result = JSON.parse(jsonStr);

    // Enforce max 3 regenerations server-side
    const fixes = result.fixes ?? {};
    let regenCount = 0;
    if (fixes.regenerateSfx) {
      fixes.regenerateSfx = fixes.regenerateSfx.slice(0, 3);
      regenCount += fixes.regenerateSfx.length;
    }
    if (fixes.regenerateVoiceover && regenCount < 3) {
      fixes.regenerateVoiceover = fixes.regenerateVoiceover.slice(0, 3 - regenCount);
      regenCount += fixes.regenerateVoiceover.length;
    }
    if (fixes.regenerateIntro) regenCount++;
    if (fixes.regenerateOutro) regenCount++;
    if (fixes.regenerateMusic) regenCount++;
    // If over budget, drop music regen first, then outro, then intro
    if (regenCount > 3) {
      if (fixes.regenerateMusic) { delete fixes.regenerateMusic; regenCount--; }
    }
    if (regenCount > 3) {
      if (fixes.regenerateOutro) { delete fixes.regenerateOutro; regenCount--; }
    }
    if (regenCount > 3) {
      if (fixes.regenerateIntro) { delete fixes.regenerateIntro; regenCount--; }
    }

    return Response.json({
      passed: !!result.passed,
      issues: Array.isArray(result.issues) ? result.issues : [],
      fixes,
    });
  } catch (err) {
    // Fail-open — any error means we skip validation
    console.error("[validate] Error (fail-open):", err);
    return Response.json({ passed: true, issues: [], fixes: {} });
  }
}

/** Build a concise text description of the tape for Haiku to review. */
function buildTapeDescription(
  clips: Array<Record<string, unknown>>,
  plan: Record<string, unknown> | null,
  contentSummary: string,
  assetStatuses: Record<string, unknown> | null
): string {
  const parts: string[] = [];

  parts.push(`## Content Summary\n${contentSummary || "No summary available"}`);

  parts.push(`\n## Clips (${clips.length} total)`);
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const dur = typeof c.trimEnd === "number" && typeof c.trimStart === "number"
      ? ((c.trimEnd as number) - (c.trimStart as number)).toFixed(1) + "s"
      : "?s";
    parts.push(
      `${i}. "${c.captionText || "(no caption)"}" [${dur}] filter=${c.selectedFilter} transition=${c.transitionType || "default"} velocity=${c.velocityPreset}`
    );
  }

  if (plan) {
    parts.push(`\n## Production Plan (key fields)`);
    const p = plan as Record<string, unknown>;
    if (p.musicPrompt) parts.push(`Music prompt: "${p.musicPrompt}"`);
    if (p.musicVolume) parts.push(`Music volume: ${p.musicVolume}`);
    if (p.sfxVolume) parts.push(`SFX volume: ${p.sfxVolume}`);
    if (p.voiceoverVolume) parts.push(`Voiceover volume: ${p.voiceoverVolume}`);
    if (p.intro) parts.push(`Intro: ${JSON.stringify(p.intro)}`);
    if (p.outro) parts.push(`Outro: ${JSON.stringify(p.outro)}`);
    if (p.sfx && Array.isArray(p.sfx)) {
      parts.push(`SFX cues: ${(p.sfx as Array<Record<string, unknown>>).map((s, i) => `${i}. clip${s.clipIndex} "${s.prompt}"`).join(", ")}`);
    }
    if (p.voiceover && typeof p.voiceover === "object") {
      const vo = p.voiceover as Record<string, unknown>;
      if (vo.segments && Array.isArray(vo.segments)) {
        parts.push(`Voiceover segments: ${(vo.segments as Array<Record<string, unknown>>).map((s, i) => `${i}. clip${s.clipIndex} "${s.text}"`).join(", ")}`);
      }
    }
  }

  if (assetStatuses) {
    parts.push(`\n## Asset Generation Statuses`);
    parts.push(JSON.stringify(assetStatuses, null, 1));
  }

  return parts.join("\n");
}

/** Extract the first valid JSON object from text. */
function extractJSON(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
