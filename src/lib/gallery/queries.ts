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

export async function listFolders(collectionId: string): Promise<Folder[]> {
  const { data, error } = await createAdminClient()
    .from('folders').select('id,collection_id,name,is_retouched,sort_order')
    .eq('collection_id', collectionId).order('sort_order');
  if (error) throw new Error(`listFolders: ${error.message}`);
  return data as Folder[];
}

export async function createFolder(
  collectionId: string, name: string, isRetouched: boolean
): Promise<Folder> {
  const { data, error } = await createAdminClient()
    .from('folders')
    .insert({ collection_id: collectionId, name, is_retouched: isRetouched })
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

export async function listPhotos(collectionId: string): Promise<Photo[]> {
  const { data, error } = await createAdminClient()
    .from('photos')
    .select('id,collection_id,folder_id,filename,thumbnail_key,preview_key,original_key,file_size_bytes,width,height,sort_order')
    .eq('collection_id', collectionId).order('sort_order');
  if (error) throw new Error(`listPhotos: ${error.message}`);
  return data as Photo[];
}

export async function createPhotos(rows: NewPhoto[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await createAdminClient().from('photos').insert(rows);
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
