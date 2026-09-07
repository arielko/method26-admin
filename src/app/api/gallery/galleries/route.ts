import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { listGalleries, createGallery } from '@/lib/gallery/queries';

export async function GET(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const collectionId = request.nextUrl.searchParams.get('collectionId') ?? '';
  if (!collectionId) return NextResponse.json({ error: 'collectionId is required' }, { status: 400 });

  return NextResponse.json({ galleries: await listGalleries(collectionId) });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { collectionId?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const collectionId = typeof body.collectionId === 'string' ? body.collectionId : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!collectionId || name.length === 0) {
    return NextResponse.json({ error: 'collectionId and name are required' }, { status: 400 });
  }

  // The token comes from createGallery, which calls newGalleryToken(). It is
  // deliberately not readable from the request: a caller-chosen token could
  // be short, guessable, or reused across clients.
  return NextResponse.json({ gallery: await createGallery(collectionId, name) });
}
