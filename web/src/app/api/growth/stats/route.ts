import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { getGrowthMetrics } from "@/lib/growth/metrics";

// E6d — Analytics pull / internal growth read-API.
// The daily Growth Agent calls this each run (Authorization: Bearer GROWTH_AGENT_SECRET) to
// get REAL funnel aggregates and populate docs/growth/GROWTH_STATUS.md — never invented.
// Returns ONLY aggregate counts/rates; no raw emails or PII ever leave the server.
//
// Owner-scoped: GROWTH_AGENT_SECRET must be set in env. Until then the route is locked
// (503) so it cannot leak even dry-run shape to the public. Track H1 rate-limited.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = checkRateLimit(`growth-stats:${ip}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  const secret = process.env.GROWTH_AGENT_SECRET;
  if (!secret) {
    // Not configured — refuse rather than expose an unauthenticated read surface.
    return NextResponse.json({ error: "Analytics surface not configured." }, { status: 503 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // Constant-ish comparison (length check first avoids early-exit on length mismatch).
  if (provided.length !== secret.length || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const metrics = await getGrowthMetrics();
    return NextResponse.json(metrics, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to compute metrics." }, { status: 500 });
  }
}
