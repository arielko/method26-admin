import { createAdminClient } from '@/lib/supabase/server';

/**
 * Every table worth restoring, in an order that can be replayed.
 *
 * Parents before children, because a restore inserts in this order and a
 * foreign key will reject a favourite whose photo does not exist yet. The
 * list is explicit rather than discovered from the schema: a table that
 * appears in the database and not here should fail loudly in the test that
 * compares the two, not be silently absent from every backup until the day
 * somebody needs one.
 */
export const BACKUP_TABLES = [
  'collections',
  'folders',
  'galleries',
  'photos',
  'gallery_folder_visibility',
  'gallery_visitors',
  'gallery_favorites',
  'gallery_views',
  'gallery_downloads',
  'gallery_emails',
  'file_drops',
  'drop_files',
  'drop_emails',
  'drop_downloads',
] as const;

export type Dump = {
  takenAt: string;
  tables: Record<string, unknown[]>;
  counts: Record<string, number>;
};

// PostgREST caps a response at 1000 rows whatever the client asks for, so a
// table is read in pages until a short page proves the end. Reading once and
// trusting the length is how a backup quietly starts holding the first
// thousand photographs of a studio that has taken more.
const PAGE = 1000;

export async function dumpAll(): Promise<Dump> {
  const client = createAdminClient();
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .range(from, from + PAGE - 1);
      // A failure must abort the whole dump. A backup file that is missing a
      // table but looks complete is worse than no backup file, because it is
      // only discovered at the moment it is needed.
      if (error) throw new Error(`dump ${table}: ${error.message}`);
      const page = (data ?? []) as unknown[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    tables[table] = rows;
    counts[table] = rows.length;
  }

  return { takenAt: new Date().toISOString(), tables, counts };
}

/** Gzipped, because the dump is mostly repeated JSON keys and compresses hard. */
export async function gzipJson(value: unknown): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * One object per day, named by date.
 *
 * Overwriting the same key within a day is deliberate: a retry after a
 * failure should replace that morning's attempt, not leave two files whose
 * difference nobody can explain later.
 */
export function backupKey(takenAt: Date): string {
  return `backups/${takenAt.toISOString().slice(0, 10)}.json.gz`;
}
