export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Validation endpoint — calls Haiku to review the assembled tape and return structured fixes.
 * When clip frames are provided, Haiku can visually inspect each clip for quality issues.
 * Fail-open: any error returns { passed: true } so the pipeline always proceeds.
 */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ passed: true, issues: [], fixes: {} });
    }

    const { clips, plan, contentSummary, assetStatuses, clipFrames } = await req.json();

    if (!clips || !Array.isArray(clips) || clips.length === 0) {
      return Response.json({ passed: true, issues: [], fixes: {} });
    }

    const hasFrames = Array.isArray(clipFrames) && clipFrames.length > 0;

    const systemPrompt = hasFrames
      ? `You are an expert short-form video reviewer with deep knowledge of what performs well on TikTok, Reels, and Shorts.

You will receive the assembled highlight tape — clip metadata, production plan, asset statuses — AND a representative frame from each clip. Study every frame carefully before making judgments.

Your job: review the tape visually and structurally, then either PASS it or return specific, structured fixes.

## How to analyze the frames
For each frame, quickly assess:
- **Subject clarity**: Is there a clear focal point? Faces, action, or a striking object?
- **Visual energy**: Does this frame convey motion, emotion, or tension — or is it dead/static?
- **Lighting & exposure**: Is it well-lit, or too dark/blown-out to read on a phone screen?
- **Composition**: Would this look good in 9:16 vertical framing?

## What to check (in priority order)

### Visual checks (use the frames)
1. **Hook frame** — The first clip's frame MUST grab attention within 0.5s. Look for: a face with expression, peak action, bright colors, unusual composition. If clip 0 is visually weak (static, dark, no clear subject), suggest reordering to put the most visually striking clip first.
2. **Visual variety** — Do the frames look distinct from each other? Flag if consecutive clips look nearly identical (same angle, same scene, same subject position). Suggest reordering or removal.
3. **Caption-visual mismatch** — Read each caption, then look at its frame. Flag only when the caption is clearly wrong or misleading (e.g., caption says "epic jump" but frame shows someone sitting). Minor mismatches are fine — captions are often stylistic.
4. **SFX-visual mismatch** — Compare each SFX prompt against its clip's frame. Flag if the sound would confuse viewers (e.g., "ocean waves crashing" on an indoor scene). Provide a corrected prompt that matches what you see.
5. **Dead clips** — Flag any frame that's too dark, blurry, or featureless to be worth including. Suggest removal via clipRemovals.
6. **Voiceover-visual coherence** — If voiceover text describes something specific, verify it roughly matches the frame. Flag only clear contradictions.

### Structural checks (metadata only)
7. **Pacing** — Check clip durations for energy oscillation. No two long clips back-to-back.
8. **Transition logic** — Hard cuts for high-energy moments, dissolves/fades for calm transitions.
9. **Narrative arc** — Does the clip order build toward a climax?
10. **Intro/outro relevance** — Does the text match the content summary?
11. **Audio balance** — Volume levels make sense for the content type.

### Holistic coherence (step back and consider the whole reel)
12. **Music-visual mood match** — Look at the overall visual energy across all frames, then read the music prompt. Does the music mood fit what you see? A high-energy montage with a "chill lo-fi" prompt, or calm scenic clips with "aggressive trap beats" — these break the viewer's experience. Suggest a corrected music prompt if mismatched.
13. **Caption narrative flow** — Read all captions in clip order as a sequence. Do they tell a coherent mini-story or at least feel like they belong together? Flag if the tone jumps randomly (e.g., funny → serious → funny) without the visuals justifying it. Suggest caption rewrites to smooth the arc.
14. **Voiceover-clip alignment** — If voiceover segments exist, read them in order alongside the clip sequence. Does the voiceover narrative progress logically with the visual progression? Flag if a voiceover segment references something that happens in a different clip.
15. **Filter consistency** — Check the filter assignments across clips. Mixed filters can work for stylistic contrast, but flag if it looks accidental (e.g., one random clip has "Vintage" while everything else is "None"). Suggest harmonizing via clipUpdates.
16. **Overall vibe check** — Imagine scrolling past this reel on TikTok. Do the visuals, captions, music mood, and SFX prompts all feel like they belong to the same piece of content? If something feels "off" even if no single rule is broken, flag it and explain what breaks the cohesion.
17. **Human feel test** — Step back and ask: "Does this feel like a machine made it, or like a human editor with taste?" Look for signs of algorithmic editing: every clip with the same transition duration, perfectly round parameter values (0.5, 0.3, 1.0 everywhere), identical velocity curves, uniform caption styling across all clips, SFX on every single cut, or voiceover that sounds like a press release. A human editor varies things — some clips breathe with no effects, others get the full treatment. The contrast is what makes it feel crafted. Flag anything that feels robotic or uniform.
18. **Creative coherence** — If the editing philosophy states a vibe (e.g., "raw documentary energy"), verify the actual per-clip choices serve that vision. A stated "elegant restraint" philosophy with aggressive zoom punches on every clip is contradictory. The philosophy, transitions, velocity curves, color grades, and caption styling should all tell the same story. Check that the film stock + per-clip filterCSS don't over-stack (combined contrast above ~1.35 crushes shadows, combined grain above 0.07 looks like a glitch, not a look).

## Rules
- PASS if the tape is good enough to post — don't be a perfectionist
- Only flag problems that would genuinely hurt engagement or confuse viewers
- Every issue MUST include its structured fix — never flag without a fix
- **Prefer free fixes**: caption rewrites, clip reordering (clipUpdates with new order), clip removal — these cost nothing
- **Regeneration is expensive**: only request it when content is genuinely wrong (max 3 per response)
- Never request music regeneration unless it completely mismatches the visual mood you see in the frames
- If an asset failed to generate, ignore it — failures are handled gracefully by the renderer
- Clip reordering = clipUpdates with new order values`
      : `You are a quality validator for short-form highlight reels (TikTok, Reels, Shorts).

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
10. Caption narrative flow — read all captions in order; do they tell a coherent mini-story or at least feel like they belong together?
11. Music-content mood match — does the music prompt fit the content summary and caption tone?
12. Filter consistency — are filter choices intentional or do random mismatches look accidental?
13. Overall coherence — do captions, music mood, SFX prompts, and voiceover all feel like they belong to the same reel?
14. Human feel test — does this feel like a machine made it? Look for: identical transition durations across clips, perfectly round parameter values everywhere (0.5, 0.3, 1.0), uniform caption styling, SFX on every cut, or robotic uniformity. A human editor varies things — some clips breathe, others get full treatment.
15. Creative coherence — if an editing philosophy is stated, do the actual choices serve that vision? Check that film stock + per-clip filterCSS don't over-stack (combined contrast > ~1.35 crushes shadows, combined grain > 0.07 looks broken).`;

    const outputFormat = `

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

    const fullSystemPrompt = systemPrompt + outputFormat;

    const tapeDescription = buildTapeDescription(clips, plan, contentSummary, assetStatuses);

    // Build message content — multimodal if frames are available, text-only otherwise.
    const userContent = hasFrames
      ? buildVisionContent(tapeDescription, clips, clipFrames as Array<{ clipIndex: number; base64: string }>)
      : tapeDescription;

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
        system: fullSystemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: AbortSignal.timeout(hasFrames ? 20_000 : 15_000),
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

/**
 * Build multimodal content blocks: interleave text descriptions with clip frame images.
 * Each clip gets a text label followed by its frame image, then the full tape description at the end.
 */
function buildVisionContent(
  tapeDescription: string,
  clips: Array<Record<string, unknown>>,
  clipFrames: Array<{ clipIndex: number; base64: string }>
): Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> {
  const content: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];
  const frameMap = new Map(clipFrames.map((f) => [f.clipIndex, f.base64]));

  // First: tape description text
  content.push({ type: "text", text: tapeDescription });

  // Then: labeled frames for visual inspection
  content.push({ type: "text", text: "\n## Visual Frames (one per clip — use these to verify captions, SFX, and visual quality)" });

  for (const [clipIndex, base64] of frameMap) {
    const clip = clips[clipIndex];
    const caption = (clip?.captionText as string) || "(no caption)";
    content.push({
      type: "text",
      text: `\nClip ${clipIndex}: "${caption}"`,
    });

    // Strip data URI prefix if present to get raw base64
    const raw = base64.includes(",") ? base64.split(",")[1] : base64;
    // Detect media type from data URI or default to JPEG
    let mediaType = "image/jpeg";
    if (base64.startsWith("data:image/png")) mediaType = "image/png";
    else if (base64.startsWith("data:image/webp")) mediaType = "image/webp";

    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: raw,
      },
    });
  }

  return content;
}

/** Build a rich text description of the tape for Haiku to review.
 * Includes full creative context so Haiku can validate coherence across
 * the AI's editing philosophy, per-clip styling, and production plan. */
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

    // Core metadata
    let line = `${i}. "${c.captionText || "(no caption)"}" [${dur}] filter=${c.selectedFilter} transition=${c.transitionType || "default"}`;

    // Per-clip creative details (so Haiku can validate coherence)
    if (c.customFilterCSS) line += ` filterCSS="${c.customFilterCSS}"`;
    if (c.transitionDuration != null) line += ` transDur=${c.transitionDuration}`;
    if (c.transitionIntensity != null) line += ` transInt=${c.transitionIntensity}`;
    if (c.entryPunchScale != null && (c.entryPunchScale as number) > 1.0) line += ` punch=${c.entryPunchScale}`;
    if (c.customVelocityKeyframes && Array.isArray(c.customVelocityKeyframes) && (c.customVelocityKeyframes as unknown[]).length > 0) {
      const kf = c.customVelocityKeyframes as Array<{ position: number; speed: number }>;
      const speeds = kf.map((k) => k.speed.toFixed(2)).join("→");
      line += ` velocity=[${speeds}]`;
    } else {
      line += ` velocity=${c.velocityPreset}`;
    }
    if (c.clipAudioVolume != null) line += ` clipAudio=${c.clipAudioVolume}`;
    if (c.beatPulseIntensity != null) line += ` beatPulse=${c.beatPulseIntensity}`;
    if (c.beatFlashOpacity != null) line += ` beatFlash=${c.beatFlashOpacity}`;

    // Caption styling details
    if (c.customCaptionAnimation) line += ` captionAnim=${c.customCaptionAnimation}`;
    if (c.customCaptionColor) line += ` captionColor=${c.customCaptionColor}`;
    if (c.customCaptionGlowColor) line += ` glow=${c.customCaptionGlowColor}`;
    if (c.captionExitAnimation) line += ` captionExit=${c.captionExitAnimation}`;

    // Transition params
    if (c.transitionParams && typeof c.transitionParams === "object") {
      const tp = c.transitionParams as Record<string, unknown>;
      const tpParts = Object.entries(tp).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`);
      if (tpParts.length > 0) line += ` transParams={${tpParts.join(",")}}`;
    }

    parts.push(line);
  }

  if (plan) {
    const p = plan as Record<string, unknown>;

    // Editing philosophy — the AI's stated creative vision
    if (p.editingPhilosophy && typeof p.editingPhilosophy === "object") {
      const phil = p.editingPhilosophy as Record<string, unknown>;
      parts.push(`\n## Editing Philosophy`);
      if (phil.vibe) parts.push(`Vibe: "${phil.vibe}"`);
      if (phil.paceProfile) parts.push(`Pace profile: ${phil.paceProfile}`);
      if (phil.transitionArc) parts.push(`Transition arc: "${phil.transitionArc}"`);
      if (phil.baseGrade) parts.push(`Base grade: "${phil.baseGrade}"`);
    }

    parts.push(`\n## Production Plan`);
    if (p.musicPrompt) parts.push(`Music prompt: "${p.musicPrompt}"`);
    if (p.musicVolume != null) parts.push(`Music volume: ${p.musicVolume}`);
    if (p.sfxVolume != null) parts.push(`SFX volume: ${p.sfxVolume}`);
    if (p.voiceoverVolume != null) parts.push(`Voiceover volume: ${p.voiceoverVolume}`);
    if (p.musicDuckRatio != null) parts.push(`Music duck ratio: ${p.musicDuckRatio}`);
    if (p.intro) parts.push(`Intro: ${JSON.stringify(p.intro)}`);
    if (p.outro) parts.push(`Outro: ${JSON.stringify(p.outro)}`);
    if (p.sfx && Array.isArray(p.sfx)) {
      parts.push(`SFX cues: ${(p.sfx as Array<Record<string, unknown>>).map((s, i) => `${i}. clip${s.clipIndex} timing="${s.timing}" "${s.prompt}" ${s.durationMs}ms`).join(", ")}`);
    }
    if (p.voiceover && typeof p.voiceover === "object") {
      const vo = p.voiceover as Record<string, unknown>;
      if (vo.segments && Array.isArray(vo.segments)) {
        parts.push(`Voiceover segments: ${(vo.segments as Array<Record<string, unknown>>).map((s, i) => `${i}. clip${s.clipIndex} delay=${s.delaySec ?? "default"} "${s.text}"`).join(", ")}`);
      }
      if (vo.voiceCharacter) parts.push(`Voice character: ${vo.voiceCharacter}`);
    }

    // Film stock & post-processing — so Haiku can catch stacking issues
    if (p.filmStock && typeof p.filmStock === "object") {
      const fs = p.filmStock as Record<string, unknown>;
      parts.push(`Film stock: grain=${fs.grain} warmth=${fs.warmth} contrast=${fs.contrast} fadedBlacks=${fs.fadedBlacks}`);
    }
    if (p.grainOpacity != null) parts.push(`Grain opacity: ${p.grainOpacity}`);
    if (p.vignetteIntensity != null) parts.push(`Vignette: intensity=${p.vignetteIntensity} tightness=${p.vignetteTightness ?? "default"} hardness=${p.vignetteHardness ?? "default"}`);

    // Beat response settings
    if (p.beatPulseIntensity != null || p.beatFlashOpacity != null) {
      parts.push(`Beat response: pulse=${p.beatPulseIntensity ?? "off"} flash=${p.beatFlashOpacity ?? "off"} threshold=${p.beatFlashThreshold ?? "default"} flashColor=${p.beatFlashColor ?? "white"}`);
    }

    // Caption defaults
    if (p.captionFontSize != null || p.captionVerticalPosition != null) {
      parts.push(`Caption defaults: fontSize=${p.captionFontSize ?? "default"} vertPos=${p.captionVerticalPosition ?? "default"} appearDelay=${p.captionAppearDelay ?? "default"} exitAnim=${p.captionExitAnimation ?? "fade"}`);
    }

    // Timing & feel
    if (p.defaultTransitionDuration != null) parts.push(`Default transition duration: ${p.defaultTransitionDuration}s`);
    if (p.settleScale != null) parts.push(`Entry settle: scale=${p.settleScale} dur=${p.settleDuration ?? "default"} easing=${p.settleEasing ?? "cubic"}`);
    if (p.exitDecelSpeed != null) parts.push(`Exit decel: speed=${p.exitDecelSpeed} dur=${p.exitDecelDuration ?? "default"} easing=${p.exitDecelEasing ?? "quad"}`);
    if (p.finalClipWarmth != null) parts.push(`Final clip warmth: ${JSON.stringify(p.finalClipWarmth)}`);

    // Audio breaths
    if (p.audioBreaths && Array.isArray(p.audioBreaths) && (p.audioBreaths as unknown[]).length > 0) {
      const breaths = (p.audioBreaths as Array<Record<string, unknown>>).map((b) => `t=${b.time}s dur=${b.duration}s depth=${b.depth}`);
      parts.push(`Audio breaths: ${breaths.join(", ")}`);
    }

    // Transition overlay tuning
    const overlayTuning: string[] = [];
    if (p.lightLeakColor) overlayTuning.push(`lightLeakColor=${p.lightLeakColor}`);
    if (p.lightLeakOpacity != null) overlayTuning.push(`lightLeakOpacity=${p.lightLeakOpacity}`);
    if (p.glitchColors) overlayTuning.push(`glitchColors=${JSON.stringify(p.glitchColors)}`);
    if (p.letterboxColor) overlayTuning.push(`letterboxColor=${p.letterboxColor}`);
    if (p.watermarkColor) overlayTuning.push(`watermarkColor=${p.watermarkColor}`);
    if (overlayTuning.length > 0) parts.push(`Overlay tuning: ${overlayTuning.join(", ")}`);
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
