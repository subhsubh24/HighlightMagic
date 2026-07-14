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

/** Free-text generation prompts on routes that use this shared cap (animate/submit,
 *  style-transfer, score). SFX/music/intro/outro keep their own stricter inline caps. */
export const MAX_PROMPT_CHARS = 2_000;
/** Planner steering text (creativeDirection / userFeedback → Claude planner tokens). */
export const MAX_DIRECTION_CHARS = 5_000;
/** A source-footage audio transcript serialized into the validation prompt. Generous — a real
 *  multi-clip reel's transcript is a few KB — but finite so it can't inflate the paid Haiku bill. */
export const MAX_TRANSCRIPT_CHARS = 40_000;
/** Backstop cap on the FULLY-ASSEMBLED validation prompt text (buildTapeDescription output). Per-
 *  field bounds catch the named inputs; this bounds every remaining serialized path at once — the
 *  arbitrary `plan` object, JSON.stringify(assetStatuses), sourceFiles[].name, per-clip strings.
 *  A legit 100-clip reel (transcript + summary + clips + plan) stays well under this; only a
 *  crafted request approaches it. ~200k chars ≈ ~50k text tokens — far above any real payload. */
export const MAX_TAPE_DESCRIPTION_CHARS = 200_000;
/** A single base64 image payload (~9MB of bytes). */
export const MAX_IMAGE_B64_CHARS = 12_000_000;
/** A single base64 audio payload (~45MB of bytes). */
export const MAX_AUDIO_B64_CHARS = 60_000_000;
/** A single base64 video payload (~450MB of bytes). */
export const MAX_VIDEO_B64_CHARS = 600_000_000;
/** One vision frame's base64 JPEG (~9MB). The frame COUNT is bounded separately. */
export const MAX_FRAME_B64_CHARS = 12_000_000;
/** A StoreKit signed transaction (compact JWS incl. the x5c cert chain) — a few KB in practice;
 *  cap generously so the crypto verifier never touches an oversized payload. */
export const MAX_JWS_CHARS = 20_000;
/** A scoring "style context" template label (e.g. "Sports", "Wedding") interpolated verbatim into
 *  the paid frame-scoring SYSTEM prompt. It's a short human-chosen label, so cap it tight: an
 *  unbounded value would inflate the per-call Anthropic token bill and is a system-prompt injection
 *  surface. 200 chars is far above any real template name. */
export const MAX_TEMPLATE_NAME_CHARS = 200;

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
