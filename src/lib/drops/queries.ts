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

export async function listDrops(limit = 20): Promise<(FileDrop & { fileCount: number })[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from('file_drops')
    .select('id,token,title,message,created_at,expires_at,drop_files(id)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listDrops: ${error.message}`);
  return (data as (FileDrop & { drop_files: { id: string }[] })[]).map((row) => ({
    id: row.id,
    token: row.token,
    title: row.title,
    message: row.message,
    created_at: row.created_at,
    expires_at: row.expires_at,
    fileCount: row.drop_files.length,
  }));
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
