/**
 * Server-side input size bounds for paid routes (ROADMAP Track H2).
 *
 * Client-side validation is UX, not security. Every expensive endpoint must re-bound its inputs
 * server-side BEFORE the paid provider call, because input size drives the bill: Claude charges
 * per token (prompt text + each vision frame), ElevenLabs TTS per character, and oversized media
 * blobs waste bandwidth/processing on every Atlas/Kling job. These caps sit far above any
 * legitimate client payload — their only job is to stop a crafted request from running up cost.
 *
 * Limits are in CHARACTERS of the (base64) string as received, which is what we actually pay to
 * move and tokenize. base64 ≈ 1.33× the raw byte size, so e.g. 12M chars ≈ ~9MB of image bytes.
 */

/** Free-text generation prompts (SFX / intro-outro / animate / style-transfer). */
export const MAX_PROMPT_CHARS = 2_000;
/** Planner steering text (creativeDirection / userFeedback → Claude planner tokens). */
export const MAX_DIRECTION_CHARS = 5_000;
/** Voiceover script — ElevenLabs TTS is billed per character, so this directly bounds spend. */
export const MAX_TTS_TEXT_CHARS = 5_000;
/** A single base64 image payload (~9MB of bytes). */
export const MAX_IMAGE_B64_CHARS = 12_000_000;
/** A single base64 audio payload (~45MB of bytes). */
export const MAX_AUDIO_B64_CHARS = 60_000_000;
/** A single base64 video payload (~450MB of bytes). */
export const MAX_VIDEO_B64_CHARS = 600_000_000;
/** One vision frame's base64 JPEG (~9MB). The frame COUNT is bounded separately. */
export const MAX_FRAME_B64_CHARS = 12_000_000;

/** True when `value` is a string longer than `max`. Absent / non-string values pass (other
 *  validation handles required-ness); this check is only about size. */
export function overStringLimit(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length > max;
}

/** True when any element of `frames` has a string property `key` longer than `max`. */
export function anyFrameOverLimit(frames: unknown, key: string, max: number): boolean {
  if (!Array.isArray(frames)) return false;
  return frames.some((f) => {
    const v = (f as Record<string, unknown> | null | undefined)?.[key];
    return typeof v === "string" && v.length > max;
  });
}

/** Generic 413 response — no field names or limits leaked to the client (Track H3 hygiene). */
export function tooLargeResponse(): Response {
  return Response.json({ error: "Request payload too large" }, { status: 413 });
}
