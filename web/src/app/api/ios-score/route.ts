import { checkExportAllowed, consumeExport } from "@/lib/entitlement";
import { CLAUDE_FRAME_SCORER } from "@/lib/ai-models";
import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { checkDailySpendCeiling, recordDailyExport } from "@/lib/spend-ceiling";
import { anyFrameOverLimit, MAX_FRAME_B64_CHARS, tooLargeResponse } from "@/lib/input-bounds";

export const runtime = "nodejs";
export const maxDuration = 120;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_FRAMES_PER_BATCH = 35;
const VALID_ROLES = new Set(["HOOK", "HERO", "REACTION", "RHYTHM", "CLOSER"]);

interface FrameInput {
  timeSec: number;
  jpegBase64: string;
  audioEnergy?: number;
  audioOnset?: number;
  audioBass?: number;
  audioMid?: number;
  audioTreble?: number;
}

interface ScoredFrameOutput {
  timeSec: number;
  score: number;
  label: string;
  role: string | null;
}

function buildScoringSystemPrompt(templateName?: string): string {
  const templateLine = templateName ? `\nStyle context: ${templateName} template` : "";
  return `You are a world-class Instagram Reels editor whose content averages 2M+ views.
You understand the PSYCHOLOGY of scrolling — what makes a thumb stop, what makes someone save,
what makes them share to their story, what makes them comment.

You're reviewing raw footage from 1 source file. Your job: deeply analyze
every single frame through the lens of INSTAGRAM VIRALITY.

SOURCE FILES:
- "video" (video)

FOR EVERY FRAME, evaluate these 6 VIRALITY DIMENSIONS:

1. SCROLL-STOP POWER — Would this freeze someone's thumb mid-scroll in the first 0.3 seconds?
   (High contrast, unexpected visuals, faces with intense emotion, dramatic scale, motion at peak)

2. EMOTIONAL INTENSITY — Does this hit you in the gut? The algorithm rewards watch-time,
   and emotion is what keeps eyeballs locked. (Joy, shock, awe, pride, tenderness, humor, tension)

3. SHAREABILITY — Would someone screenshot this or send it to a friend? "OMG LOOK AT THIS"
   moments. (Impressive feats, beautiful compositions, funny/unexpected, relatable reactions)

4. SAVE POTENTIAL — Would someone hit the bookmark? Saves are weighted HIGHEST by the
   Instagram algorithm. (Aspirational moments, beautiful visuals, tutorial-worthy technique,
   emotional peaks worth rewatching)

5. VISUAL PUNCH — How does this look on a 6-inch phone screen at half-brightness on a bus?
   Instagram is consumed on mobile. (High contrast > subtle, saturated > muted, close-up > wide,
   clean composition > cluttered, faces > landscapes at small scale)

6. NARRATIVE ROLE — How would this serve a viral reel? Think about its FUNCTION:
   - HOOK: Could open the reel and stop scrolling
   - HERO: The main event, the peak moment, what the reel is "about"
   - REACTION: A face/moment that amplifies a hero moment via juxtaposition
   - RHYTHM: A transition beat, texture, pacing control
   - CLOSER: Could end the reel and trigger a replay/loop

7. AUDIO INTELLIGENCE — Each frame has TWO audio signals:
   audioEnergy (0.0-1.0) = volume/loudness at this moment:
   - High (0.7+) = loud (crowd cheering, bass drop, impact, laughter)
   - Medium (0.3-0.7) = moderate (conversation, ambient music, movement)
   - Low (0.0-0.3) = quiet (silence, calm, anticipation, whispers)

   audioOnset (0.0-1.0) = how much the audio CHANGED — transient/beat detection:
   - High onset (0.5+) = something just HAPPENED (beat hit, impact, clap, sudden sound, bass drop)
   - This is the most important audio signal for editing — onsets are natural CUT POINTS.
   - High onset + high energy = definitive beat/impact moment (perfect for flash transitions, velocity hits)
   - High onset + low energy = the start of something (voice beginning, subtle sound emerging)
   - Low onset + high energy = sustained loudness (crowd noise, continuous music — not a cut point)
   Audio onset is what pro editors use to sync cuts to music. When you see a high onset, that's
   where a transition or speed change should land.

   FREQUENCY BANDS — What KIND of audio is happening (when available):
   audioBass (0.0-1.0): proportion of energy in bass (20-300 Hz) — drums, bass guitar, sub-bass
   audioMid (0.0-1.0): proportion of energy in voice band (300-2000 Hz) — speech, vocals, melody
   audioTreble (0.0-1.0): proportion of energy in treble (2000-8000 Hz) — cymbals, sibilants, brightness
   These ratios sum to ~1.0. Use them to identify what's happening sonically:
   - Mid-dominant (audioMid > 0.5): Likely SPEECH — someone talking, narrating, reacting
   - Bass-dominant (audioBass > 0.4) + onset peaks: Likely MUSIC with strong beat / bass drop
   - Broad spectrum (all bands 0.2-0.5): Full mix — music with vocals, rich soundscape
   - Treble-heavy (audioTreble > 0.4): Bright sounds — cymbals, crowd hiss, sharp transients
   Factor this into your label — note "speech detected" or "bass-heavy beat" when relevant.

8. TEMPORAL DYNAMICS — Where does this frame sit in the moment's arc?
   This is what separates editors who find moments from editors who FEEL them.
   - Is this the PEAK of the action, or the wind-up just BEFORE impact?
   - Is energy RISING (anticipation/approach), PEAKING (climax/impact), or FALLING (aftermath/reaction)?
   - Peak moments are rare and precious — the ball hitting the net, the first bite, the jump's apex.
   - Wind-up frames create tension that makes peaks DEVASTATING (the arm pulling back before the throw).
   - Aftermath frames capture raw reaction (the face 0.5s after the surprise, the crowd erupting).
   - Compare each frame to its neighbors in the timeline — is energy building or releasing?

Score each frame 0.0-1.0 based on OVERALL VIRALITY (weighing all 8 dimensions):
- 0.85-1.0: VIRAL POTENTIAL — this frame alone could carry a reel. Scroll-stopping,
  emotionally loaded, share-worthy. Peak action, raw genuine emotion, stunning composition,
  dramatic lighting, unexpected beauty, decisive moments, perfect timing.
- 0.65-0.84: STRONG BEAT — compelling enough to hold attention in a well-edited sequence.
  Good energy, interesting composition, narrative contribution. Supporting moments that
  make the hero shots hit harder by contrast.
- 0.35-0.64: USABLE — generic energy but potentially valuable as a quick beat, reaction
  cutaway, or pacing change. Context-dependent value.
- 0.0-0.34: DEAD WEIGHT — black frames, extreme blur, obstructed lens, test footage,
  nothing visually or emotionally redeemable.

LABEL INSTRUCTIONS — This is CRITICAL. Your label is the planner's EYES.

The tape planner will read your labels to understand the footage WITHOUT seeing the images.
Your label must capture FIVE things in one vivid sentence:
1. WHAT's in the frame (specific, cinematic description)
2. MOTION — what's moving and how (camera panning, subject mid-leap, static close-up, slow drift)
3. ENERGY ARC — is this a build-up, peak, or aftermath? (approaching impact / at the apex / reacting after)
4. WHY it's viral (the emotional/visual hook)
5. HOW it could be used (its narrative role + suggested speed treatment)

NOT: "people dancing" → YES: "group mid-air jumping in sync under pink strobes, confetti frozen at apex — PEAK energy, share-worthy spectacle, hero shot begging for bullet slow-mo"
NOT: "food on plate" → YES: "golden-crusted salmon, steam curl drifting up under warm pendant, camera slowly pushing in — RISING beauty, save-worthy food porn, could open the tape with ramp_out into the detail"
NOT: "person smiling" → YES: "genuine shocked reaction 0.5s after reveal, mouth open eyes wide, completely still — AFTERMATH energy, golden-hour backlight, perfect reaction beat to hard-cut after a hero moment"${templateLine}

Respond with ONLY a JSON array:
[{"index": 0, "score": 0.85, "role": "HERO", "label": "vivid description + viral reason + narrative role"}]

The "role" field must be one of: HOOK, HERO, REACTION, RHYTHM, CLOSER.
Pick the BEST fit for each frame — what role would this moment play in a viral reel?`;
}

function buildBatchContent(batch: FrameInput[], batchOffset: number): object[] {
  const content: object[] = [];
  for (let i = 0; i < batch.length; i++) {
    const frame = batch[i];
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: frame.jpegBase64 },
    });
    let annotation = `Frame ${i} — source: "video" (video), timestamp: ${frame.timeSec.toFixed(1)}s`;
    if (frame.audioEnergy != null) {
      annotation += `, audioEnergy: ${frame.audioEnergy.toFixed(2)}`;
    }
    if (frame.audioOnset != null && frame.audioOnset > 0.1) {
      annotation += `, audioOnset: ${frame.audioOnset.toFixed(2)}`;
    }
    if (
      frame.audioBass != null &&
      frame.audioMid != null &&
      frame.audioTreble != null &&
      frame.audioEnergy != null &&
      frame.audioEnergy > 0.1
    ) {
      annotation += `, spectrum: B${frame.audioBass.toFixed(2)}/M${frame.audioMid.toFixed(2)}/T${frame.audioTreble.toFixed(2)}`;
    }
    content.push({ type: "text", text: annotation });
  }
  void batchOffset; // kept for future delta labeling
  return content;
}

interface ParsedItem {
  index: number;
  score: number;
  label: string;
  role: string | null;
}

function parseBatchResponse(text: string): ParsedItem[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const raw = match[0]
      .replace(/,(\s*[}\]])/g, "$1"); // strip trailing commas
    const arr = JSON.parse(raw) as Record<string, unknown>[];
    return arr
      .map((item) => ({
        index: typeof item.index === "number" ? Math.round(item.index) : -1,
        score: typeof item.score === "number" ? Math.max(0, Math.min(1, item.score)) : 0.5,
        label: typeof item.label === "string" ? item.label : "highlight",
        role:
          typeof item.role === "string" && VALID_ROLES.has(item.role) ? item.role : null,
      }))
      .filter((r) => r.index >= 0);
  } catch {
    return [];
  }
}

async function scoreBatchWithHaiku(
  batch: FrameInput[],
  batchOffset: number,
  systemPrompt: string
): Promise<ScoredFrameOutput[]> {
  const content = buildBatchContent(batch, batchOffset);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
    let response: Response;
    try {
      response = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model: CLAUDE_FRAME_SCORER,
          max_tokens: 16000,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content }],
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(`HTTP ${response.status}`);
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : Math.pow(2, attempt) * 2000;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 15_000)));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Haiku scoring failed: HTTP ${response.status}`);
    }
    const json = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const textBlock = json.content?.find((b) => b.type === "text");
    const text = textBlock?.text ?? "";
    const parsed = parseBatchResponse(text);

    return parsed
      .filter((r) => r.index >= 0 && r.index < batch.length)
      .map((r) => ({
        timeSec: batch[r.index].timeSec,
        score: r.score,
        label: r.label,
        role: r.role,
      }));
  }
  throw lastError ?? new Error("Haiku scoring failed after retries");
}

function zScoreNormalize(frames: ScoredFrameOutput[]): ScoredFrameOutput[] {
  if (frames.length <= 1) return frames;
  const scores = frames.map((f) => f.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev <= 0.001) return frames;
  const zScores = scores.map((s) => (s - mean) / stdDev);
  const minZ = Math.min(...zScores);
  const maxZ = Math.max(...zScores);
  if (maxZ - minZ <= 0.001) return frames;
  return frames.map((f, i) => ({
    ...f,
    score: Math.round(((zScores[i] - minZ) / (maxZ - minZ)) * 100) / 100,
  }));
}

/**
 * POST /api/ios-score
 *
 * iOS-native scoring proxy. Accepts annotated video frames from the iOS CloudScoringService
 * and routes them through Haiku on the backend — eliminating the embedded Anthropic API key
 * from the iOS binary. Enforces freemium quota server-side before any paid model call.
 *
 * Request:  { userId, signedTransaction?, frames: [{timeSec, jpegBase64, audioEnergy?, audioOnset?, audioBass?, audioMid?, audioTreble?}], templateName? }
 * Response: { frames: [{timeSec, score, label, role}], remaining }
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ip = getClientIP(req);
  const rl = checkRateLimit(`ios-score:${ip}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  const { userId, signedTransaction, frames, templateName } = body as {
    userId: unknown;
    signedTransaction?: unknown;
    frames: unknown;
    templateName?: unknown;
  };

  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }
  if (!Array.isArray(frames) || frames.length === 0) {
    return Response.json({ error: "frames must be a non-empty array" }, { status: 400 });
  }
  if (frames.length > 1000) {
    return Response.json({ error: "frames must be 1000 or fewer" }, { status: 400 });
  }
  // H2: bound per-frame payload — cost scales with each base64 image sent to the vision model.
  if (anyFrameOverLimit(frames, "jpegBase64", MAX_FRAME_B64_CHARS)) return tooLargeResponse();

  // Validate each frame has required fields
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i] as Record<string, unknown>;
    if (typeof f.timeSec !== "number" || typeof f.jpegBase64 !== "string" || !f.jpegBase64) {
      return Response.json(
        { error: `frames[${i}] must have timeSec (number) and jpegBase64 (string)` },
        { status: 400 }
      );
    }
  }

  // ── SERVER-SIDE GATE — before any paid model call ──
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

  const ceiling = await checkDailySpendCeiling(userId);
  if (!ceiling.allowed) {
    return Response.json(
      { error: "Daily export limit reached. Please try again tomorrow." },
      { status: 429 },
    );
  }

  const systemPrompt = buildScoringSystemPrompt(
    typeof templateName === "string" && templateName ? templateName : undefined
  );

  const typedFrames = frames as FrameInput[];

  // Split into batches of 35 and score sequentially
  const allResults: ScoredFrameOutput[] = [];
  try {
    for (let i = 0; i < typedFrames.length; i += MAX_FRAMES_PER_BATCH) {
      const batch = typedFrames.slice(i, i + MAX_FRAMES_PER_BATCH);
      const batchResults = await scoreBatchWithHaiku(batch, i, systemPrompt);
      allResults.push(...batchResults);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ios-score] Haiku scoring error:", message);
    return Response.json({ error: "Scoring failed" }, { status: 502 });
  }

  // Z-score normalize across all batches (matches web + iOS pipeline)
  const normalized = zScoreNormalize(allResults);

  // Consume quota now that the paid call succeeded
  await consumeExport({ userId, isPro: decision.isPro });
  await recordDailyExport(userId);

  const remaining = decision.isPro ? -1 : Math.max(0, decision.remaining - 1);

  console.log(`[ios-score] userId=${userId} frames=${typedFrames.length} scored=${normalized.length} remaining=${remaining}`);

  return Response.json({ frames: normalized, remaining });
}
