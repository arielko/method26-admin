import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { createPhotos } from '@/lib/gallery/queries';
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

  // Every derivative is required. A row missing preview_key renders as a
  // broken lightbox on the client's proofing page, long after the upload
  // that caused it.
  for (const photo of photos as NewPhoto[]) {
    for (const field of ['collection_id', 'filename', 'thumbnail_key', 'preview_key', 'original_key'] as const) {
      if (typeof photo[field] !== 'string' || photo[field].length === 0) {
        return NextResponse.json({ error: `each photo needs ${field}` }, { status: 400 });
      }
    }
  }

  try {
    await createPhotos(photos as NewPhoto[]);
    return NextResponse.json({ created: photos.length });
  } catch (error) {
    console.error('createPhotos failed', error);
    return NextResponse.json({ error: 'Could not save photos' }, { status: 500 });
  }
}
