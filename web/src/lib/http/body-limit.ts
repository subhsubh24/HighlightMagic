/**
 * Track H — pre-parse body-size guard for paid / public routes.
 *
 * Reject an over-declared request body BEFORE `req.json()` buffers it into
 * memory. A cheap O(1) Content-Length fast-fail that mirrors the inline
 * `MAX_BODY_SIZE` guard the image/video/audio routes (voice-clone, thumbnail,
 * upscale, animate/submit, style-transfer, talking-head, proxy-video) already
 * apply — closing the same pre-parse memory-exhaustion surface on the
 * text/audio routes that lacked it.
 *
 * Returns a 413 `Response` when the DECLARED body exceeds `maxBytes`, else null.
 *
 * NOTE: fast-path pre-filter only. A client can omit or lie about
 * Content-Length (chunked transfer sends no length), so the AUTHORITATIVE bound
 * remains the per-field size caps applied AFTER parse. This just rejects the
 * common oversized-body case early, at no cost to legitimate traffic — the caps
 * below sit well above any real request, so a valid body is never rejected.
 */
export function enforceBodyLimit(req: Request, maxBytes: number): Response | null {
  const header = req.headers.get("content-length");
  if (header) {
    const declared = Number.parseInt(header, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return Response.json({ error: "Request body too large." }, { status: 413 });
    }
  }
  return null;
}

/**
 * Default cap for JSON routes carrying only text + a signed transaction. A real
 * request is a few KB (a ≤20K-char JWS + a ≤1K-char prompt/text field); 1 MB is
 * ~40x headroom, so it can never reject a legitimate body while still blocking a
 * multi-hundred-MB parse-bomb before `req.json()` runs.
 */
export const JSON_BODY_LIMIT_BYTES = 1 * 1024 * 1024;
