import { createAdminClient } from '@/lib/supabase/server';
import { newGalleryToken } from '@/lib/gallery/token';

export type FileDrop = {
  id: string;
  token: string;
  title: string | null;
  message: string | null;
  created_at: string;
  expires_at: string | null;
};

export type DropFile = {
  id: string;
  drop_id: string;
  filename: string;
  object_key: string;
  content_type: string;
  file_size_bytes: number | null;
  sort_order: number;
};

export async function createDrop(input: {
  title?: string | null;
  message?: string | null;
  expiresAt?: string | null;
}): Promise<FileDrop> {
  const { data, error } = await createAdminClient()
    .from('file_drops')
    .insert({
      token: newGalleryToken(),
      title: input.title?.trim() || null,
      message: input.message?.trim() || null,
      expires_at: input.expiresAt ?? null,
    })
    .select('id,token,title,message,created_at,expires_at')
    .single();
  if (error) throw new Error(`createDrop: ${error.message}`);
  return data as FileDrop;
}

export async function updateDrop(
  id: string,
  patch: { title?: string | null; message?: string | null; expires_at?: string | null }
): Promise<void> {
  const { error } = await createAdminClient().from('file_drops').update(patch).eq('id', id);
  if (error) throw new Error(`updateDrop: ${error.message}`);
}

export async function getDrop(id: string): Promise<FileDrop | null> {
  const { data, error } = await createAdminClient()
    .from('file_drops')
    .select('id,token,title,message,created_at,expires_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getDrop: ${error.message}`);
  return (data as FileDrop) ?? null;
}

export async function listDrops(
  limit = 20
): Promise<(FileDrop & { fileCount: number; collectors: number; lastDownloadAt: string | null })[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from('file_drops')
    .select('id,token,title,message,created_at,expires_at,drop_files(id),drop_downloads(visitor_hash,downloaded_at)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listDrops: ${error.message}`);
  return (
    data as (FileDrop & {
      drop_files: { id: string }[];
      drop_downloads: { visitor_hash: string; downloaded_at: string }[];
    })[]
  ).map((row) => {
    // Distinct people, not rows. A download row is written per file, so a
    // three-file transfer collected once by one recipient leaves three rows —
    // reporting "3" there would read as three separate collections and make
    // "has anyone picked this up?" impossible to answer at a glance.
    const collectors = new Set(row.drop_downloads.map((d) => d.visitor_hash)).size;
    const lastDownloadAt = row.drop_downloads.reduce<string | null>(
      (latest, d) => (latest === null || d.downloaded_at > latest ? d.downloaded_at : latest),
      null
    );
    return {
      id: row.id,
      token: row.token,
      title: row.title,
      message: row.message,
      created_at: row.created_at,
      expires_at: row.expires_at,
      fileCount: row.drop_files.length,
      collectors,
      lastDownloadAt,
    };
  });
}

export async function dropExists(id: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('file_drops').select('id').eq('id', id).maybeSingle();
  if (error) throw new Error(`dropExists: ${error.message}`);
  return data !== null;
}

export async function addDropFiles(
  dropId: string,
  files: Omit<DropFile, 'drop_id' | 'sort_order'>[]
): Promise<void> {
  if (files.length === 0) return;
  // Ordered from the current maximum rather than from zero, so a second batch
  // added to the same transfer lands after the first instead of interleaving.
  const { data: existing, error: readError } = await createAdminClient()
    .from('drop_files').select('sort_order').eq('drop_id', dropId)
    .order('sort_order', { ascending: false }).limit(1);
  if (readError) throw new Error(`addDropFiles: ${readError.message}`);
  let next = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;

  const { error } = await createAdminClient()
    .from('drop_files')
    .insert(files.map((file) => ({ ...file, drop_id: dropId, sort_order: next++ })));
  if (error) throw new Error(`addDropFiles: ${error.message}`);
}

export async function listDropFiles(dropId: string): Promise<DropFile[]> {
  const { data, error } = await createAdminClient()
    .from('drop_files')
    .select('id,drop_id,filename,object_key,content_type,file_size_bytes,sort_order')
    .eq('drop_id', dropId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`listDropFiles: ${error.message}`);
  return (data ?? []) as DropFile[];
}

export async function recordDropEmail(row: {
  drop_id: string;
  recipient: string;
  subject: string;
  status: 'sent' | 'failed';
  provider_id?: string | null;
  error?: string | null;
}): Promise<void> {
  const { error } = await createAdminClient().from('drop_emails').insert(row);
  // Logging must never be the reason a delivered file looks undelivered.
  if (error) console.error('recordDropEmail failed', error.message);
}

export async function deleteDrop(id: string): Promise<void> {
  const { error } = await createAdminClient().from('file_drops').delete().eq('id', id);
  if (error) throw new Error(`deleteDrop: ${error.message}`);
  // The B2 objects behind these rows are left in place — this app holds only
  // signed PUT/GET for the bucket, the same trade deletePhotos documents.
}

/** A transfer whose link is about to stop working, with who was told about it. */
export type ReminderCandidate = {
  id: string;
  token: string;
  title: string | null;
  message: string | null;
  expires_at: string;
  fileCount: number;
  recipients: string[];
};

/**
 * Transfers that expire soon, nobody has collected, and nobody has been
 * reminded about.
 *
 * The window is 36 hours rather than 24 because the job runs once a day: a
 * 24-hour window would miss any transfer expiring in the gap between two
 * runs, and would do so silently. 36 hours guarantees every expiry is seen at
 * least once, and `reminder_sent_at` is what stops it being seen twice.
 *
 * Recipients come from what was actually delivered — `drop_emails` rows with
 * status 'sent' — not from anything typed into the form. A reminder is only
 * ever sent to an address that already received the original link, so this
 * job can never introduce a new recipient.
 */
export async function listDropsNeedingReminder(now = new Date()): Promise<ReminderCandidate[]> {
  const horizon = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from('file_drops')
    .select(
      'id,token,title,message,expires_at,reminder_sent_at,' +
        'drop_files(id),drop_downloads(id),drop_emails(recipient,status,sent_at)'
    )
    .is('reminder_sent_at', null)
    .not('expires_at', 'is', null)
    .gt('expires_at', now.toISOString())
    .lte('expires_at', horizon);
  if (error) throw new Error(`listDropsNeedingReminder: ${error.message}`);

  // Don't remind about a transfer sent a few hours ago. A one-day expiry puts
  // a drop inside the window the moment it is created, and "your files expire
  // tomorrow" arriving the same afternoon as "here are your files" reads as a
  // broken system, not a helpful nudge.
  const quietPeriodMs = 12 * 60 * 60 * 1000;

  const rows = (data ?? []) as unknown as {
    id: string;
    token: string;
    title: string | null;
    message: string | null;
    expires_at: string;
    drop_files: { id: string }[];
    drop_downloads: { id: string }[];
    drop_emails: { recipient: string; status: string; sent_at: string }[];
  }[];

  return rows
    .filter((row) => row.drop_downloads.length === 0)
    .filter((row) => row.drop_files.length > 0)
    .map((row) => {
      const delivered = row.drop_emails.filter((e) => e.status === 'sent');
      const newest = delivered.reduce<string | null>(
        (latest, e) => (latest === null || e.sent_at > latest ? e.sent_at : latest),
        null
      );
      const settled = newest !== null && now.getTime() - new Date(newest).getTime() > quietPeriodMs;
      return {
        id: row.id,
        token: row.token,
        title: row.title,
        message: row.message,
        expires_at: row.expires_at,
        fileCount: row.drop_files.length,
        // Deduplicated: the studio may have sent the same link twice, and the
        // recipient should not get the reminder twice for it.
        recipients: settled ? [...new Set(delivered.map((e) => e.recipient))] : [],
      };
    })
    .filter((row) => row.recipients.length > 0);
}

/**
 * Marks a transfer as reminded.
 *
 * Written whether or not every recipient's mail succeeded. A provider failure
 * is recorded per recipient in `drop_emails`; retrying the whole transfer the
 * next morning would re-mail everyone who did receive it.
 */
export async function markReminderSent(id: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('file_drops')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`markReminderSent: ${error.message}`);
}
