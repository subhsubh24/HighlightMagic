import { NextRequest, NextResponse } from 'next/server';
import { checkQuota } from '@/lib/quota';

export const dynamic = 'force-dynamic';

/**
 * POST /api/quota/check
 *
 * Check whether a user has remaining free exports for the current month.
 * Called by the web frontend and iOS app before starting the paid pipeline.
 *
 * Body: { userId: string, isProUser?: boolean }
 * Response: { allowed: boolean, used: number, limit: number }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { userId, isProUser } = body as Record<string, unknown>;

  if (typeof userId !== 'string' || userId.trim() === '') {
    return NextResponse.json({ error: 'userId (string) is required' }, { status: 400 });
  }

  // Pro users always have quota available — skip KV lookup
  if (isProUser === true) {
    return NextResponse.json({ allowed: true, used: 0, limit: 5 });
  }

  const status = await checkQuota(userId.trim());
  return NextResponse.json(status);
}
