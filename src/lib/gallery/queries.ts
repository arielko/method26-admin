import { createAdminClient } from '@/lib/supabase/server';
import { newGalleryToken } from './token';
import type { Collection, Folder, Photo, NewPhoto, Gallery } from './types';

// Service-role throughout. RLS is enabled on every gallery table with NO
// policy, so anon and authenticated are denied everything — the service key
// is the only way in, and these routes are the only holders of it. Every
// caller must have authenticated first; see the auth constraint.

export async function listCollections(): Promise<Collection[]> {
  const { data, error } = await createAdminClient()
    .from('collections').select('id,name,created_at').order('created_at', { ascending: false });
  if (error) throw new Error(`listCollections: ${error.message}`);
  return data as Collection[];
}

export async function createCollection(name: string): Promise<Collection> {
  const { data, error } = await createAdminClient()
    .from('collections').insert({ name }).select('id,name,created_at').single();
  if (error) throw new Error(`createCollection: ${error.message}`);
  return data as Collection;
}

// Used by the presign route to reject a collectionId that names nothing —
// otherwise a session could mint signed PUT URLs under an arbitrary,
// possibly non-existent, collection prefix.
export async function collectionExists(id: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('collections').select('id').eq('id', id).maybeSingle();
  if (error) throw new Error(`collectionExists: ${error.message}`);
  return data !== null;
}

export async function listFolders(collectionId: string): Promise<Folder[]> {
  const { data, error } = await createAdminClient()
    .from('folders').select('id,collection_id,name,is_retouched,sort_order')
    .eq('collection_id', collectionId).order('sort_order');
  if (error) throw new Error(`listFolders: ${error.message}`);
  return data as Folder[];
}

// Used by the photos route to derive collection_id from folder_id server
// side, and to reject a folder_id that names nothing — see I-5.
export async function getFolder(id: string): Promise<Folder | null> {
  const { data, error } = await createAdminClient()
    .from('folders').select('id,collection_id,name,is_retouched,sort_order')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(`getFolder: ${error.message}`);
  return data as Folder | null;
}

async function nextSortOrder(table: 'folders' | 'photos', collectionId: string): Promise<number> {
  const { data, error } = await createAdminClient()
    .from(table)
    .select('sort_order')
    .eq('collection_id', collectionId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextSortOrder(${table}): ${error.message}`);
  return data.length > 0 ? (data[0] as { sort_order: number }).sort_order + 1 : 0;
}

export async function createFolder(
  collectionId: string, name: string, isRetouched: boolean
): Promise<Folder> {
  // Every folder used to get sort_order 0 by omission, so a second folder
  // collided with the first and the two-surface split's ordering became
  // whatever Postgres felt like on a given page load. Computed here from
  // the current maximum instead.
  const sortOrder = await nextSortOrder('folders', collectionId);
  const { data, error } = await createAdminClient()
    .from('folders')
    .insert({ collection_id: collectionId, name, is_retouched: isRetouched, sort_order: sortOrder })
    .select('id,collection_id,name,is_retouched,sort_order').single();
  if (error) throw new Error(`createFolder: ${error.message}`);
  return data as Folder;
}

export async function updateFolder(
  id: string, patch: { name?: string; is_retouched?: boolean }
): Promise<void> {
  const { error } = await createAdminClient().from('folders').update(patch).eq('id', id);
  if (error) throw new Error(`updateFolder: ${error.message}`);
}

// Used by the image route to resolve a photo to a derivative key. Selects
// only thumbnail_key and preview_key — original_key is never fetched here,
// so this route has no data in hand it could leak into a signed URL for
// full-resolution bytes.
export async function getPhotoForImage(
  id: string
): Promise<Pick<Photo, 'id' | 'thumbnail_key' | 'preview_key'> | null> {
  const { data, error } = await createAdminClient()
    .from('photos').select('id,thumbnail_key,preview_key').eq('id', id).maybeSingle();
  if (error) throw new Error(`getPhotoForImage: ${error.message}`);
  return data as Pick<Photo, 'id' | 'thumbnail_key' | 'preview_key'> | null;
}

export async function listPhotos(collectionId: string): Promise<Photo[]> {
  const { data, error } = await createAdminClient()
    .from('photos')
    .select('id,collection_id,folder_id,filename,thumbnail_key,preview_key,original_key,file_size_bytes,width,height,sort_order')
    .eq('collection_id', collectionId).order('sort_order');
  if (error) throw new Error(`listPhotos: ${error.message}`);
  return data as Photo[];
}

// Each row is inserted the moment its own upload finishes (see
// src/lib/gallery/upload.ts), so this is called once per photo in
// practice, but still accepts a batch for flexibility. sort_order is
// assigned here rather than by the caller — restarting at 0 on every
// upload session made a second batch collide with the first, and Postgres
// gives no guaranteed order among ties, so the sequence a client saw could
// differ between two page loads.
export async function createPhotos(rows: Omit<NewPhoto, 'sort_order'>[]): Promise<void> {
  if (rows.length === 0) return;
  const nextForCollection = new Map<string, number>();
  const withOrder: NewPhoto[] = [];
  for (const row of rows) {
    let next = nextForCollection.get(row.collection_id);
    if (next === undefined) {
      next = await nextSortOrder('photos', row.collection_id);
    }
    withOrder.push({ ...row, sort_order: next });
    nextForCollection.set(row.collection_id, next + 1);
  }
  const { error } = await createAdminClient().from('photos').insert(withOrder);
  if (error) throw new Error(`createPhotos: ${error.message}`);
}

export async function listGalleries(collectionId: string): Promise<Gallery[]> {
  const { data, error } = await createAdminClient()
    .from('galleries').select('id,collection_id,token,name,is_published,expiration_date')
    .eq('collection_id', collectionId).order('created_at', { ascending: false });
  if (error) throw new Error(`listGalleries: ${error.message}`);
  return data as Gallery[];
}

export async function createGallery(collectionId: string, name: string): Promise<Gallery> {
  const { data, error } = await createAdminClient()
    .from('galleries')
    .insert({ collection_id: collectionId, name, token: newGalleryToken(), is_published: false })
    .select('id,collection_id,token,name,is_published,expiration_date').single();
  if (error) throw new Error(`createGallery: ${error.message}`);
  return data as Gallery;
}

export async function updateGallery(
  id: string, patch: { is_published?: boolean; expiration_date?: string | null }
): Promise<void> {
  const { error } = await createAdminClient().from('galleries').update(patch).eq('id', id);
  if (error) throw new Error(`updateGallery: ${error.message}`);
}

export async function setFolderVisibility(
  galleryId: string, folderId: string, isVisible: boolean
): Promise<void> {
  const { error } = await createAdminClient()
    .from('gallery_folder_visibility')
    .upsert({ gallery_id: galleryId, folder_id: folderId, is_visible: isVisible });
  if (error) throw new Error(`setFolderVisibility: ${error.message}`);
}

export async function listHiddenFolders(
  galleryIds: string[]
): Promise<Record<string, string[]>> {
  if (galleryIds.length === 0) return {};
  const { data, error } = await createAdminClient()
    .from('gallery_folder_visibility')
    .select('gallery_id,folder_id')
    .in('gallery_id', galleryIds)
    .eq('is_visible', false);
  if (error) throw new Error(`listHiddenFolders: ${error.message}`);

  const hidden: Record<string, string[]> = {};
  for (const row of data as { gallery_id: string; folder_id: string }[]) {
    (hidden[row.gallery_id] ??= []).push(row.folder_id);
  }
  return hidden;
}
