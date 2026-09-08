import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { getGallery, updateGallery, deleteGallery, photoInCollection } from '@/lib/gallery/queries';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const { id } = await params;
  let body: {
    isPublished?: unknown;
    expiresInDays?: unknown;
    name?: unknown;
    coverPhotoId?: unknown;
    downloadsEnabled?: unknown;
    emailCaptureEnabled?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: {
    name?: string;
    is_published?: boolean;
    expiration_date?: string | null;
    cover_photo_id?: string | null;
    downloads_enabled?: boolean;
    email_capture_enabled?: boolean;
  } = {};

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (name.length === 0 || name.length > 200) {
      return NextResponse.json({ error: 'name must be 1 to 200 characters' }, { status: 400 });
    }
    patch.name = name;
  }

  if (typeof body.isPublished === 'boolean') patch.is_published = body.isPublished;

  // downloads_enabled controls whether the public proofing surface offers
  // full-resolution originals — it is off by default for that reason, not
  // a cosmetic toggle, so it is only ever set from an explicit boolean.
  if (typeof body.downloadsEnabled === 'boolean') patch.downloads_enabled = body.downloadsEnabled;
  if (typeof body.emailCaptureEnabled === 'boolean') patch.email_capture_enabled = body.emailCaptureEnabled;

  if (body.expiresInDays === null) {
    patch.expiration_date = null;
  } else if (typeof body.expiresInDays === 'number') {
    if (!Number.isFinite(body.expiresInDays) || body.expiresInDays <= 0) {
      return NextResponse.json({ error: 'expiresInDays must be a positive number' }, { status: 400 });
    }
    patch.expiration_date = new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString();
  }

  if ('coverPhotoId' in body) {
    if (body.coverPhotoId === null) {
      patch.cover_photo_id = null;
    } else if (typeof body.coverPhotoId === 'string') {
      // The photo id is never trusted as belonging to this gallery just
      // because the caller says so — it has to actually exist inside the
      // gallery's own collection, resolved server-side from the id in the
      // URL, not from anything else the client sent.
      const gallery = await getGallery(id);
      if (!gallery) return NextResponse.json({ error: 'gallery not found' }, { status: 404 });
      const belongs = await photoInCollection(body.coverPhotoId, gallery.collection_id);
      if (!belongs) {
        return NextResponse.json(
          { error: 'coverPhotoId does not belong to this gallery’s collection' },
          { status: 400 }
        );
      }
      patch.cover_photo_id = body.coverPhotoId;
    } else {
      return NextResponse.json({ error: 'coverPhotoId must be a string or null' }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  await updateGallery(id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const { id } = await params;
  const gallery = await getGallery(id);
  if (!gallery) return NextResponse.json({ error: 'gallery not found' }, { status: 404 });

  await deleteGallery(id);
  return NextResponse.json({ ok: true });
}
