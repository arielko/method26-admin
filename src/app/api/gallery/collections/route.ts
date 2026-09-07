import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { listCollections, createCollection } from '@/lib/gallery/queries';

// middleware.ts exempts /api, so these checks are the only protection.
export async function GET(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);
  return NextResponse.json({ collections: await listCollections() });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length === 0 || name.length > 120) {
    return NextResponse.json({ error: 'name must be 1 to 120 characters' }, { status: 400 });
  }

  return NextResponse.json({ collection: await createCollection(name) });
}
