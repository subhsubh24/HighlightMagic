import { NextRequest, NextResponse } from 'next/server';
import { incrementQuota } from '@/lib/quota';

export const dynamic = 'force-dynamic';

/**
 * POST /api/quota/increment
 *
 * Atomically increment the free-tier export counter for a user.
 * Called after a successful export completes.
 * No-op for Pro users — only free-tier exports count toward the limit.
 *
 * Body: { userId: string, isProUser?: boolean }
 * Response: { ok: true }
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

  // Only count free-tier exports toward the quota
  if (isProUser !== true) {
    await incrementQuota(userId.trim());
  }

  return NextResponse.json({ ok: true });
}
