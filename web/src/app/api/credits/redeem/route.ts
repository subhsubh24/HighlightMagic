import { redeemCreditPack } from "@/lib/entitlement";
import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { MAX_JWS_CHARS, overStringLimit, tooLargeResponse } from "@/lib/input-bounds";
import { enforceBodyLimit, JSON_BODY_LIMIT_BYTES } from "@/lib/http/body-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Redeem a StoreKit consumable "export credit pack" (ROADMAP F / business-case lever b).
 *
 * A free user who has hit the monthly export limit can buy a credit pack instead of subscribing.
 * The iOS client finishes the StoreKit purchase and POSTs the signed transaction here; the server
 * cryptographically verifies it (Apple-anchored JWS), maps the product to a credit count, and
 * idempotently grants the credits (keyed on Apple's transactionId — a replay never double-grants).
 * Nothing the client asserts is trusted beyond Apple's signature, mirroring the Pro gate.
 *
 * Body: { userId: string, signedTransaction: string }
 * 200 → { ok, granted, balance, duplicate }   (grant recorded; duplicate=true on an idempotent replay)
 * 400 → bad input · 402 → transaction could not be verified / not a credit pack · 429 → rate limited
 */
export async function POST(req: Request) {
  // Track H1: rate limit per IP (JWS verify + KV writes — throttle abuse/replay attempts).
  const ip = getClientIP(req);
  const rl = checkRateLimit(`credits-redeem:${ip}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  // H2: pre-parse body cap — reject an over-declared body before req.json() buffers it into
  // memory (the per-field MAX_JWS_CHARS cap below stays the authoritative bound after parse).
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT_BYTES);
  if (tooLarge) return tooLarge;

  let body: { userId?: string; signedTransaction?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { userId, signedTransaction } = body;
  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }
  if (!signedTransaction || typeof signedTransaction !== "string") {
    return Response.json({ error: "signedTransaction is required" }, { status: 400 });
  }
  // H2: bound the signed-transaction payload before the crypto path touches it.
  if (overStringLimit(signedTransaction, MAX_JWS_CHARS)) return tooLargeResponse();

  const result = await redeemCreditPack({ userId, signedTransaction });
  if (!result.ok) {
    // 402: the purchase could not be verified / is not a credit pack. Generic reason only — no
    // provider/crypto detail leaks to the client (error hygiene, Track H3).
    return Response.json(
      { error: result.reason ?? "could not redeem purchase" },
      { status: 402 },
    );
  }

  return Response.json({
    ok: true,
    granted: result.granted,
    balance: result.balance,
    duplicate: result.duplicate ?? false,
  });
}
