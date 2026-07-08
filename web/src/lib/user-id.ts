/**
 * Shared bound + validator for the client-supplied `userId` (Track H2 — server-side input bounds).
 *
 * The iOS app sends an anonymous per-install UUID as `userId`; the backend uses it verbatim as a
 * suffix on Vercel-KV keys ("2026-07:{userId}", "spend:gen:{period}:{userId}", "credits:{userId}").
 * The value is UNVALIDATED free text from the wire, so without a bound a hostile client could send a
 * multi-megabyte `userId` and mint a pathological KV key (wasted storage, key-size limits) on the
 * paid path. A legitimate id is a ~36-char UUID, so a generous 128-char ceiling rejects abuse while
 * never touching a real client.
 */
export const MAX_USER_ID_CHARS = 128;

/**
 * True when `userId` is a non-empty string within {@link MAX_USER_ID_CHARS}. Callers on the paid
 * path treat a false result as "deny / no-op" and never derive a KV key from the value — fail
 * closed, consistent with the quota/ceiling gates' existing behavior on an unverifiable input.
 */
export function isValidUserId(userId: unknown): userId is string {
  return typeof userId === "string" && userId.length > 0 && userId.length <= MAX_USER_ID_CHARS;
}
