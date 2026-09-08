import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import {
  createPhotos,
  getFolder,
  photosCollectionIds,
  movePhotosToFolder,
  promotePhotoToFront,
  deletePhotos,
} from '@/lib/gallery/queries';
import { photoKeysMatchLayout } from '@/lib/gallery/keys';
import type { NewPhoto } from '@/lib/gallery/types';

// middleware.ts exempts /api — this check is the only thing protecting the
// route.
export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { photos?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const photos = body.photos;
  if (!Array.isArray(photos) || photos.length === 0) {
    return NextResponse.json({ error: 'photos must be a non-empty array' }, { status: 400 });
  }

  // collection_id is never accepted from the caller — a folder_id from one
  // collection paired with a caller-supplied collection_id from another
  // used to render in the grid while every tile 404s against the bucket.
  // It's derived below from the folder the photo actually belongs to.
  // folder_id itself is required for the same reason an omitted one used
  // to insert NULL and the photo became permanently invisible with no
  // error.
  for (const photo of photos as Record<string, unknown>[]) {
    for (const field of ['folder_id', 'filename', 'thumbnail_key', 'preview_key', 'original_key'] as const) {
      if (typeof photo[field] !== 'string' || (photo[field] as string).length === 0) {
        return NextResponse.json({ error: `each photo needs ${field}` }, { status: 400 });
      }
    }
  }

  const resolved: Omit<NewPhoto, 'sort_order'>[] = [];
  for (const photo of photos as Record<string, unknown>[]) {
    const folderId = photo.folder_id as string;
    const folder = await getFolder(folderId);
    if (!folder) {
      return NextResponse.json({ error: `unknown folder_id: ${folderId}` }, { status: 400 });
    }

    const keys = {
      thumbnail_key: photo.thumbnail_key as string,
      preview_key: photo.preview_key as string,
      original_key: photo.original_key as string,
    };
    // Rejects a key that was never actually signed for this
    // collection/photo — e.g. one copy-pasted from a different upload, or
    // hand-crafted to point at an object that doesn't belong to this row.
    if (!photoKeysMatchLayout(folder.collection_id, keys)) {
      return NextResponse.json(
        { error: 'object keys do not match this collection/photo layout' },
        { status: 400 }
      );
    }

    resolved.push({
      collection_id: folder.collection_id,
      folder_id: folder.id,
      filename: photo.filename as string,
      ...keys,
      file_size_bytes: typeof photo.file_size_bytes === 'number' ? photo.file_size_bytes : null,
      width: typeof photo.width === 'number' ? photo.width : null,
      height: typeof photo.height === 'number' ? photo.height : null,
    });
  }

  try {
    await createPhotos(resolved);
    return NextResponse.json({ created: resolved.length });
  } catch (error) {
    console.error('createPhotos failed', error);
    return NextResponse.json({ error: 'Could not save photos' }, { status: 500 });
  }
}

// Two operations, both driven by the collection detail screen's dense grid:
//   { ids: string[], folderId: string | null }  — move to a folder, or to
//     "All Photos" (folderId: null — photos.folder_id is nullable for this)
//   { id: string, promote: true }                — "Change Cover": become
//     the first photo in the collection (see promotePhotoToFront)
// Every id is checked against photosCollectionIds before anything is
// written, the same "resolved server-side, never trusted from the caller"
// discipline the POST handler above uses for folder_id — a folderId or
// photo id from a different collection is rejected rather than silently
// cross-linking two clients' shoots.
export async function PATCH(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { ids?: unknown; folderId?: unknown; id?: unknown; promote?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.promote === true) {
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const collectionIds = await photosCollectionIds([id]);
    const collectionId = collectionIds.get(id);
    if (!collectionId) return NextResponse.json({ error: 'unknown photo id' }, { status: 404 });
    await promotePhotoToFront(id, collectionId);
    return NextResponse.json({ ok: true });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array (or use id + promote)' }, { status: 400 });
  }
  if (!('folderId' in body) || (typeof body.folderId !== 'string' && body.folderId !== null)) {
    return NextResponse.json({ error: 'folderId must be a string or null' }, { status: 400 });
  }

  const collectionIds = await photosCollectionIds(ids);
  const missing = ids.filter((id) => !collectionIds.has(id));
  if (missing.length > 0) {
    return NextResponse.json({ error: `unknown photo id(s): ${missing.join(', ')}` }, { status: 404 });
  }
  const collectionsInvolved = new Set(collectionIds.values());

  if (typeof body.folderId === 'string') {
    const folder = await getFolder(body.folderId);
    if (!folder) return NextResponse.json({ error: 'unknown folderId' }, { status: 400 });
    for (const collectionId of collectionsInvolved) {
      if (collectionId !== folder.collection_id) {
        return NextResponse.json(
          { error: 'folderId does not belong to the same collection as every selected photo' },
          { status: 400 }
        );
      }
    }
  }

  await movePhotosToFolder(ids, body.folderId as string | null);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }

  await deletePhotos(ids);
  return NextResponse.json({ ok: true });
}
