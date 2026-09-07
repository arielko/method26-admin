import { createAdminClient } from '@/lib/supabase/server';
import { newGalleryToken } from './token';
import type { Collection, Folder, Photo, NewPhoto, Gallery, GalleryVisitor } from './types';
import { rankConsensus, groupFavoritesByVisitor, countByVisitor } from './analytics';

const GALLERY_COLUMNS =
  'id,collection_id,token,name,is_published,expiration_date,cover_photo_id,downloads_enabled,email_capture_enabled';

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

// Used by the collection detail page to render a name/header without
// pulling every collection down first.
export async function getCollection(id: string): Promise<Collection | null> {
  const { data, error } = await createAdminClient()
    .from('collections').select('id,name,created_at').eq('id', id).maybeSingle();
  if (error) throw new Error(`getCollection: ${error.message}`);
  return data as Collection | null;
}

// Used by the galleries index to show a photo count per collection without
// a round trip per card. Selects only the foreign key — the studio scale
// this app runs at (dozens of collections, thousands of photos) makes one
// narrow column pull cheaper than a grouped count RPC, and avoids adding
// database functions this app would be the only caller of.
export async function countPhotosByCollection(): Promise<Record<string, number>> {
  const { data, error } = await createAdminClient().from('photos').select('collection_id');
  if (error) throw new Error(`countPhotosByCollection: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of data as { collection_id: string }[]) {
    counts[row.collection_id] = (counts[row.collection_id] ?? 0) + 1;
  }
  return counts;
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
    .from('galleries').select(GALLERY_COLUMNS)
    .eq('collection_id', collectionId).order('created_at', { ascending: false });
  if (error) throw new Error(`listGalleries: ${error.message}`);
  return data as Gallery[];
}

// Used by the settings/analytics routes to load one link by id, and to
// learn its collection_id server-side — never taken from the request — so
// a cover photo or any other cross-referenced id can be checked against the
// collection it actually claims to belong to.
export async function getGallery(id: string): Promise<Gallery | null> {
  const { data, error } = await createAdminClient()
    .from('galleries').select(GALLERY_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`getGallery: ${error.message}`);
  return data as Gallery | null;
}

export async function createGallery(collectionId: string, name: string): Promise<Gallery> {
  const { data, error } = await createAdminClient()
    .from('galleries')
    .insert({ collection_id: collectionId, name, token: newGalleryToken(), is_published: false })
    .select(GALLERY_COLUMNS).single();
  if (error) throw new Error(`createGallery: ${error.message}`);
  return data as Gallery;
}

export async function updateGallery(
  id: string,
  patch: {
    name?: string;
    is_published?: boolean;
    expiration_date?: string | null;
    cover_photo_id?: string | null;
    downloads_enabled?: boolean;
    email_capture_enabled?: boolean;
  }
): Promise<void> {
  const { error } = await createAdminClient().from('galleries').update(patch).eq('id', id);
  if (error) throw new Error(`updateGallery: ${error.message}`);
}

// Used before writing cover_photo_id: a photo id has to actually belong to
// this gallery's own collection, or a stray id (typo, stale client state,
// deliberate probing) would let the cover point at another client's photo.
export async function photoInCollection(photoId: string, collectionId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('photos').select('id').eq('id', photoId).eq('collection_id', collectionId).maybeSingle();
  if (error) throw new Error(`photoInCollection: ${error.message}`);
  return data !== null;
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

// ---------------------------------------------------------------------
// Analytics
//
// gallery_views, gallery_downloads and gallery_favorites can each run to a
// few hundred rows for a single client link — small enough to pull in full
// and aggregate here, in the same spirit as countPhotosByCollection above.
// What crosses the wire to the browser is always the aggregate or the
// display-ready list, never a raw table dump for client-side counting.
//
// visitor_id is nullable throughout: a gallery with email_capture_enabled
// off collects views, downloads and favorites with no visitor attached at
// all. Every function below treats that as "unknowable who", not as zero
// rows — callers are expected to say so in the UI rather than render an
// empty-looking table.
// ---------------------------------------------------------------------

async function photosByIds(photoIds: string[]): Promise<Map<string, { id: string; filename: string }>> {
  if (photoIds.length === 0) return new Map();
  const { data, error } = await createAdminClient()
    .from('photos').select('id,filename').in('id', Array.from(new Set(photoIds)));
  if (error) throw new Error(`photosByIds: ${error.message}`);
  return new Map((data as { id: string; filename: string }[]).map((p) => [p.id, p]));
}

async function visitorsByIds(visitorIds: string[]): Promise<Map<string, GalleryVisitor>> {
  if (visitorIds.length === 0) return new Map();
  const { data, error } = await createAdminClient()
    .from('gallery_visitors')
    .select('id,gallery_id,first_name,last_name,email,created_at')
    .in('id', Array.from(new Set(visitorIds)));
  if (error) throw new Error(`visitorsByIds: ${error.message}`);
  return new Map((data as GalleryVisitor[]).map((v) => [v.id, v]));
}

export type GalleryOverviewStats = { views: number; visitors: number; favorites: number; downloads: number };

// Head-only counts — Postgres/PostgREST return the row count without the
// rows ever leaving the database, so this stays cheap regardless of a
// link's traffic.
export async function getGalleryOverviewStats(galleryId: string): Promise<GalleryOverviewStats> {
  const client = createAdminClient();
  const [views, visitors, favorites, downloads] = await Promise.all([
    client.from('gallery_views').select('*', { count: 'exact', head: true }).eq('gallery_id', galleryId),
    client.from('gallery_visitors').select('*', { count: 'exact', head: true }).eq('gallery_id', galleryId),
    client.from('gallery_favorites').select('*', { count: 'exact', head: true }).eq('gallery_id', galleryId),
    client.from('gallery_downloads').select('*', { count: 'exact', head: true }).eq('gallery_id', galleryId),
  ]);
  const labelled = [['views', views], ['visitors', visitors], ['favorites', favorites], ['downloads', downloads]] as const;
  for (const [label, result] of labelled) {
    if (result.error) throw new Error(`getGalleryOverviewStats(${label}): ${result.error.message}`);
  }
  return {
    views: views.count ?? 0,
    visitors: visitors.count ?? 0,
    favorites: favorites.count ?? 0,
    downloads: downloads.count ?? 0,
  };
}

export type FavoriteGroup = {
  visitor: { id: string; firstName: string; lastName: string; email: string } | null;
  photos: { id: string; filename: string }[];
};

// Which frames were picked, and by whom when a visitor is known. Grouped by
// visitor for display; an extra group with visitor: null carries every
// favorite this gallery cannot attribute to anyone.
export async function listFavoritesByVisitor(galleryId: string): Promise<FavoriteGroup[]> {
  const { data, error } = await createAdminClient()
    .from('gallery_favorites').select('photo_id,visitor_id').eq('gallery_id', galleryId);
  if (error) throw new Error(`listFavoritesByVisitor: ${error.message}`);
  const rows = data as { photo_id: string; visitor_id: string | null }[];
  const grouped = groupFavoritesByVisitor(rows);

  const [photos, visitors] = await Promise.all([
    photosByIds(rows.map((r) => r.photo_id)),
    visitorsByIds(grouped.byVisitor.map((g) => g.visitorId)),
  ]);
  const toPhotoList = (ids: string[]) =>
    ids.map((id) => photos.get(id)).filter((p): p is { id: string; filename: string } => p !== undefined);

  const groups: FavoriteGroup[] = grouped.byVisitor.map((g) => {
    const visitor = visitors.get(g.visitorId);
    return {
      visitor: visitor
        ? { id: visitor.id, firstName: visitor.first_name, lastName: visitor.last_name, email: visitor.email }
        : null,
      photos: toPhotoList(g.photoIds),
    };
  });
  if (grouped.unattributedPhotoIds.length > 0) {
    groups.push({ visitor: null, photos: toPhotoList(grouped.unattributedPhotoIds) });
  }
  return groups;
}

export type ConsensusFrame = {
  photoId: string;
  filename: string;
  likeCount: number;
  likedBy: { id: string; firstName: string; lastName: string }[];
};

// Frames ranked by how many different visitors picked them — the view the
// studio actually retouches from. See rankConsensus for why an
// unattributed favorite (no visitor_id) never contributes to the count.
export async function getConsensusRanking(galleryId: string): Promise<ConsensusFrame[]> {
  const { data, error } = await createAdminClient()
    .from('gallery_favorites').select('photo_id,visitor_id').eq('gallery_id', galleryId);
  if (error) throw new Error(`getConsensusRanking: ${error.message}`);
  const ranked = rankConsensus(data as { photo_id: string; visitor_id: string | null }[]);

  const [photos, visitors] = await Promise.all([
    photosByIds(ranked.map((r) => r.photoId)),
    visitorsByIds(ranked.flatMap((r) => r.visitorIds)),
  ]);

  return ranked.map((r) => ({
    photoId: r.photoId,
    filename: photos.get(r.photoId)?.filename ?? '',
    likeCount: r.likeCount,
    likedBy: r.visitorIds
      .map((id) => visitors.get(id))
      .filter((v): v is GalleryVisitor => v !== undefined)
      .map((v) => ({ id: v.id, firstName: v.first_name, lastName: v.last_name })),
  }));
}

export type VisitorWithActivity = GalleryVisitor & { viewCount: number; downloadCount: number };

// Who opened the gallery, with first seen (created_at) and how much they
// did once they were in — used for both the Visitors table and its CSV
// export.
export async function listVisitorsWithActivity(galleryId: string): Promise<VisitorWithActivity[]> {
  const client = createAdminClient();
  const [visitorsRes, viewsRes, downloadsRes] = await Promise.all([
    client.from('gallery_visitors').select('id,gallery_id,first_name,last_name,email,created_at')
      .eq('gallery_id', galleryId).order('created_at', { ascending: false }),
    client.from('gallery_views').select('visitor_id').eq('gallery_id', galleryId),
    client.from('gallery_downloads').select('visitor_id').eq('gallery_id', galleryId),
  ]);
  if (visitorsRes.error) throw new Error(`listVisitorsWithActivity(visitors): ${visitorsRes.error.message}`);
  if (viewsRes.error) throw new Error(`listVisitorsWithActivity(views): ${viewsRes.error.message}`);
  if (downloadsRes.error) throw new Error(`listVisitorsWithActivity(downloads): ${downloadsRes.error.message}`);

  const viewCounts = countByVisitor(viewsRes.data as { visitor_id: string | null }[]);
  const downloadCounts = countByVisitor(downloadsRes.data as { visitor_id: string | null }[]);

  return (visitorsRes.data as GalleryVisitor[]).map((v) => ({
    ...v,
    viewCount: viewCounts.get(v.id) ?? 0,
    downloadCount: downloadCounts.get(v.id) ?? 0,
  }));
}

export type DownloadLogEntry = {
  photoId: string | null;
  filename: string | null;
  visitor: { firstName: string; lastName: string; email: string } | null;
  downloadedAt: string;
};

// What was downloaded and when. photo_id and visitor_id are both nullable
// on this table (a photo can be deleted later; a download can be
// anonymous), so both are resolved defensively rather than assumed present.
export async function listDownloadLog(galleryId: string): Promise<DownloadLogEntry[]> {
  const { data, error } = await createAdminClient()
    .from('gallery_downloads')
    .select('photo_id,visitor_id,downloaded_at')
    .eq('gallery_id', galleryId)
    .order('downloaded_at', { ascending: false });
  if (error) throw new Error(`listDownloadLog: ${error.message}`);
  const rows = data as { photo_id: string | null; visitor_id: string | null; downloaded_at: string }[];

  const [photos, visitors] = await Promise.all([
    photosByIds(rows.map((r) => r.photo_id).filter((id): id is string => id !== null)),
    visitorsByIds(rows.map((r) => r.visitor_id).filter((id): id is string => id !== null)),
  ]);

  return rows.map((r) => {
    const visitor = r.visitor_id ? visitors.get(r.visitor_id) : undefined;
    return {
      photoId: r.photo_id,
      filename: r.photo_id ? (photos.get(r.photo_id)?.filename ?? null) : null,
      visitor: visitor ? { firstName: visitor.first_name, lastName: visitor.last_name, email: visitor.email } : null,
      downloadedAt: r.downloaded_at,
    };
  });
}
