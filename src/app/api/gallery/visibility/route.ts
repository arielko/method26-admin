import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { setFolderVisibility } from '@/lib/gallery/queries';

export async function PATCH(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { galleryId?: unknown; folderId?: unknown; isVisible?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const galleryId = typeof body.galleryId === 'string' ? body.galleryId : '';
  const folderId = typeof body.folderId === 'string' ? body.folderId : '';
  // Only an explicit boolean. Hiding a folder from a client is a decision,
  // not something a truthy value should be able to make by accident.
  if (!galleryId || !folderId || typeof body.isVisible !== 'boolean') {
    return NextResponse.json(
      { error: 'galleryId, folderId and a boolean isVisible are required' },
      { status: 400 }
    );
  }

  await setFolderVisibility(galleryId, folderId, body.isVisible);
  return NextResponse.json({ ok: true });
}
