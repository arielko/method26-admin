import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { signedPutUrl } from '@/lib/gallery/b2';
import { dropObjectKey } from '@/lib/drops/keys';
import { dropExists } from '@/lib/drops/queries';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION_RE = /^(\.[A-Za-z0-9]{1,12})?$/;

// Mints one signed PUT for one file in one transfer.
//
// Unlike the gallery's presign, the content type is NOT restricted to images:
// a transfer is for whatever the studio needs to send — a zip of raws, a PDF
// contract, a video. What keeps this from being a general write primitive is
// the same thing as there: the key is derived server-side from ids this route
// validates, never taken from the caller.
export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { dropId?: unknown; fileId?: unknown; extension?: unknown; contentType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { dropId, fileId, extension, contentType } = body;
  if (
    typeof dropId !== 'string' ||
    typeof fileId !== 'string' ||
    typeof extension !== 'string' ||
    typeof contentType !== 'string'
  ) {
    return NextResponse.json(
      { error: 'dropId, fileId, extension and contentType are required' },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(dropId) || !UUID_RE.test(fileId)) {
    return NextResponse.json({ error: 'dropId and fileId must be UUIDs' }, { status: 400 });
  }
  if (!EXTENSION_RE.test(extension)) {
    return NextResponse.json({ error: 'invalid extension' }, { status: 400 });
  }
  // A content type reaches a Content-Type header on a file the recipient
  // downloads, so it may not carry a newline or anything that could split it.
  if (contentType.length > 120 || /[^\x20-\x7e]/.test(contentType)) {
    return NextResponse.json({ error: 'invalid content type' }, { status: 400 });
  }
  if (!(await dropExists(dropId))) {
    return NextResponse.json({ error: 'unknown transfer' }, { status: 400 });
  }

  try {
    const key = dropObjectKey(dropId, fileId, extension);
    return NextResponse.json({ key, url: await signedPutUrl(key, contentType) });
  } catch (error) {
    console.error('drop presign failed', error);
    return NextResponse.json({ error: 'Could not sign upload' }, { status: 500 });
  }
}
