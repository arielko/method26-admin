import { NextRequest, NextResponse } from 'next/server';
import { authenticateMachine } from '@/lib/api/machine-auth';
import { deleteDrop, listExpiredDrops } from '@/lib/drops/queries';
import { purgeExpired } from '@/lib/drops/purge';
import { deleteObject } from '@/lib/drops/r2';

export const dynamic = 'force-dynamic';

/**
 * Erases transfers whose link has expired: their files from R2, then their
 * rows from the database (downloads and the email log go with them).
 *
 * Driven by the daily keepalive Worker, like the reminders route, and for the
 * same reason. It runs after the backup, so the morning's restore point
 * already exists if a bad query ever deleted more than it should.
 *
 * This route deletes data without a session, so it shares the machine guard
 * rather than inventing its own. The bucket's 90-day lifecycle rule stays in
 * place as a backstop for anything this misses.
 */
export async function POST(request: NextRequest) {
  const auth = authenticateMachine(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await purgeExpired({
    list: () => listExpiredDrops(),
    deleteObject,
    deleteRow: deleteDrop,
  });

  for (const failure of result.failed) {
    console.error('purge: kept a transfer for retry', failure.id, failure.error);
  }

  // 500 on any failure so the keepalive's log shows it; the rest of the batch
  // was still purged, and the failed transfers are retried tomorrow.
  return NextResponse.json(
    {
      ok: result.failed.length === 0,
      purged: result.purged.length,
      failed: result.failed.length,
      remaining: result.remaining,
    },
    { status: result.failed.length === 0 ? 200 : 500 }
  );
}
