import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { signedPutUrl } from '@/lib/gallery/b2';

// This route mints write credentials for the bucket. src/middleware.ts
// exempts /api entirely, so nothing upstream protects it — without the
// check below, anyone on the internet could obtain URLs to write into
// method26's storage.
export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { objects?: { key?: unknown; contentType?: unknown }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const objects = body.objects;
  if (!Array.isArray(objects) || objects.length === 0 || objects.length > 60) {
    return NextResponse.json({ error: 'objects must be an array of 1 to 60 entries' }, { status: 400 });
  }

  for (const object of objects) {
    if (typeof object.key !== 'string' || typeof object.contentType !== 'string') {
      return NextResponse.json({ error: 'each object needs a key and a contentType' }, { status: 400 });
    }
    // Keys are built by the server-side layout convention below; reject any
    // that try to climb out of it. A key is a storage path, and "../" in one
    // is never a legitimate upload.
    if (object.key.includes('..') || object.key.startsWith('/')) {
      return NextResponse.json({ error: 'invalid key' }, { status: 400 });
    }
  }

  try {
    const urls = await Promise.all(
      objects.map((o) => signedPutUrl(o.key as string, o.contentType as string))
    );
    return NextResponse.json({ urls });
  } catch (error) {
    // Never echo the underlying message: it can name configuration.
    console.error('presign failed', error);
    return NextResponse.json({ error: 'Could not sign upload' }, { status: 500 });
  }
}
