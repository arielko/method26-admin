import { NextRequest, NextResponse } from 'next/server';
import { authenticateMachine } from '@/lib/api/machine-auth';
import { dumpAll, gzipJson, backupKey } from '@/lib/backup/dump';
import { presignPut } from '@/lib/drops/r2';

export const dynamic = 'force-dynamic';

/**
 * Writes a restore point for the database to R2, once a day.
 *
 * The free Supabase plan has no downloadable backups. Pausing does not lose
 * data — a paused project restores intact — so this is not about pausing. It
 * is about the other way data goes wrong: a migration that does more than
 * intended, a delete with a mis-scoped filter, a script run against the wrong
 * environment. On the free plan there is no restore point for any of those.
 *
 * What is being protected is small and irreplaceable: which frames each
 * client chose, who was sent what, who collected it. None of it can be
 * reconstructed from the photographs.
 *
 * The bytes live in the studio's own R2 bucket, which is private. The dump
 * contains client email addresses, so a public bucket here would be a
 * disclosure, not a backup.
 */
export async function POST(request: NextRequest) {
  const auth = authenticateMachine(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const dump = await dumpAll();
  const body = await gzipJson(dump);
  const key = backupKey(new Date(dump.takenAt));

  const url = await presignPut(key, 'application/gzip', 900);
  const put = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/gzip' },
    body: body as unknown as BodyInit,
  });

  if (!put.ok) {
    // Deliberately does not echo the response body: an S3 error can quote the
    // signed URL, and the signed URL carries the access key id.
    console.error('backup: R2 rejected the write', put.status);
    return NextResponse.json({ error: `Backup upload failed (${put.status})` }, { status: 502 });
  }

  // The counts travel in the response so the caller — and the studio reading
  // a log — can see a backup went from 283 rows to 4 without opening the
  // file. A backup that silently shrinks is the failure worth catching.
  return NextResponse.json({ ok: true, key, bytes: body.length, counts: dump.counts });
}
