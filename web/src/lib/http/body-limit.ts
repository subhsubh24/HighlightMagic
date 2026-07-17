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

/**
 * Cap for the paid VISION routes whose frame COUNT is bounded to ≤1000
 * (score, ios-score — both reject `frames.length > 1000`) or to ≤MAX_FILES=100
 * clip frames (validate, ios-validate). Their bodies carry an array of downscaled
 * JPEG frames, but `req.json()` buffers the WHOLE body into memory before the
 * per-frame caps run — so a client sending the per-field ceiling (1000 × 12M chars)
 * could push ~12 GB into memory first.
 *
 * Frames are always downscaled before upload — web extracts at 480p
 * (frame-extractor FRAME_TARGET_HEIGHT), iOS at 512×512 @ q0.6 (CloudScoringService)
 * — so a real frame is ~50–110 KB base64. The worst-case LEGITIMATE body is
 * ~1000 × 110 KB ≈ 110 MB (score/ios-score) or ~100 × 110 KB ≈ 11 MB
 * (validate/ios-validate). 300 MB is ~2.7x headroom over the largest of these, so
 * it never rejects a valid request while cutting the pre-parse surface from
 * ~12 GB to 300 MB. The per-field caps remain the authoritative bound.
 *
 * NOTE: the PLANNER routes (plan, ios-plan) are NOT covered by this cap — their
 * frame count is bounded to MAX_PLANNER_FRAMES (≫1000), so they need the larger
 * PLANNER_BODY_LIMIT_BYTES below. Applying 300 MB there would 413 a legitimate
 * large multi-clip project.
 */
export const VISION_BODY_LIMIT_BYTES = 300 * 1024 * 1024;

/**
 * Cap for the paid PLANNER routes (plan, ios-plan). Unlike the vision routes, the
 * planner accepts up to MAX_PLANNER_FRAMES frames (constants.ts: MAX_FILES(100) ×
 * MAX_BASE_FRAMES_PER_VIDEO(120) = 12,000), because it plans across every clip in a
 * project at once — and the client posts the full extracted-frame array (with
 * base64) to it. At the same ~50–160 KB/frame downscaled size, a legitimate
 * full-size project is ~12,000 × 160 KB ≈ 1.9 GB, so the vision cap would reject it.
 *
 * 3 GB sits comfortably above that worst-case legitimate 12,000-frame body (~1.6x
 * headroom even at the generous 160 KB/frame estimate, so it never 413s a valid
 * project the route's own MAX_PLANNER_FRAMES check would accept) while still
 * bounding the pre-parse surface — the per-field theoretical (12,000 × 12M chars
 * ≈ 144 GB) is cut ~48x. The MAX_PLANNER_FRAMES count cap + per-frame
 * MAX_FRAME_B64_CHARS cap remain the authoritative bound after parse.
 */
export const PLANNER_BODY_LIMIT_BYTES = 3 * 1024 * 1024 * 1024;
