import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { createPhotos, getFolder } from '@/lib/gallery/queries';
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
