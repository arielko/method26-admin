import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { updateGallery } from '@/lib/gallery/queries';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const { id } = await params;
  let body: { isPublished?: unknown; expiresInDays?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: { is_published?: boolean; expiration_date?: string | null } = {};
  if (typeof body.isPublished === 'boolean') patch.is_published = body.isPublished;

  if (body.expiresInDays === null) {
    patch.expiration_date = null;
  } else if (typeof body.expiresInDays === 'number') {
    if (!Number.isFinite(body.expiresInDays) || body.expiresInDays <= 0) {
      return NextResponse.json({ error: 'expiresInDays must be a positive number' }, { status: 400 });
    }
    patch.expiration_date = new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  await updateGallery(id, patch);
  return NextResponse.json({ ok: true });
}
