// Removing a transfer for good: its files in R2, then its database rows.
//
// Pure and dependency-injected, like keys.ts, so the ordering and failure
// rules below can be tested without a database or a bucket.
//
// The order is the point. The `drop_files` rows are the only record of which
// object keys belong to a transfer, so they must outlive the bytes: delete the
// objects first and the rows only once every object is gone. If an object
// delete fails the row stays, the next morning's run finds the transfer again,
// and deleting a key that is already gone is a no-op — so a half-finished
// purge repairs itself instead of leaking storage.

export type ExpiredDrop = { id: string; keys: string[] };

export type PurgeDeps = {
  list: () => Promise<ExpiredDrop[]>;
  deleteObject: (key: string) => Promise<void>;
  deleteRow: (id: string) => Promise<void>;
};

/**
 * One morning's ceiling. Every object and every row is a subrequest from the
 * admin Worker, and a Worker that hits its subrequest limit fails the whole
 * run. Transfers are sent a few at a time, so this is generous; a backlog
 * simply drains over the following days.
 */
export const MAX_PURGES_PER_RUN = 20;

export async function purgeDrop(
  deps: Pick<PurgeDeps, 'deleteObject' | 'deleteRow'>,
  drop: ExpiredDrop
): Promise<void> {
  for (const key of drop.keys) {
    await deps.deleteObject(key);
  }
  await deps.deleteRow(drop.id);
}

export type PurgeResult = {
  purged: string[];
  failed: { id: string; error: string }[];
  /** Expired transfers left for tomorrow because of the per-run cap. */
  remaining: number;
};

export async function purgeExpired(deps: PurgeDeps, max = MAX_PURGES_PER_RUN): Promise<PurgeResult> {
  const expired = await deps.list();
  const batch = expired.slice(0, max);

  const purged: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const drop of batch) {
    try {
      await purgeDrop(deps, drop);
      purged.push(drop.id);
    } catch (caught) {
      // One bad transfer must not hold up the rest of the queue.
      failed.push({ id: drop.id, error: caught instanceof Error ? caught.message : String(caught) });
    }
  }

  return { purged, failed, remaining: expired.length - batch.length };
}
