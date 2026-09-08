import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { signedPutUrl } from '@/lib/gallery/b2';
import { objectKeys } from '@/lib/gallery/keys';
import { collectionExists } from '@/lib/gallery/queries';

// This route mints write credentials for the bucket. src/middleware.ts
// exempts /api entirely, so nothing upstream protects it — without the
// check below, anyone on the internet could obtain URLs to write into
// method26's storage.
//
// The caller never supplies a raw key. It used to, checked only for ".."
// and a leading "/" — a valid session could mint a signed PUT for ANY key
// in the bucket, including one already delivered to a client, overwriting
// the bytes behind a row that would still look valid. The server now
// derives the key from (collectionId, photoId, extension), the same way
// the eventual photos row is built.
const IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
]);

// The one place the derivative type is stated. upload.ts PUTs with this and
// derivatives.ts encodes to it; a test pins all three together.
export const DERIVATIVE_CONTENT_TYPE = 'image/webp';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION_RE = /^\.[a-z0-9]{1,5}$/i;

export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: { collectionId?: unknown; photoId?: unknown; extension?: unknown; contentType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { collectionId, photoId, extension, contentType } = body;
  if (
    typeof collectionId !== 'string' ||
    typeof photoId !== 'string' ||
    typeof extension !== 'string' ||
    typeof contentType !== 'string'
  ) {
    return NextResponse.json(
      { error: 'collectionId, photoId, extension and contentType are required' },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(photoId)) {
    return NextResponse.json({ error: 'photoId must be a UUID' }, { status: 400 });
  }
  if (!EXTENSION_RE.test(extension)) {
    return NextResponse.json({ error: 'invalid extension' }, { status: 400 });
  }
  // The original's content type is caller-supplied (it's the client's real
  // file), but restricted to images — this route exists to sign uploads
  // into a photo gallery, not an arbitrary write primitive.
  if (!IMAGE_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'unsupported content type' }, { status: 400 });
  }
  if (!(await collectionExists(collectionId))) {
    return NextResponse.json({ error: 'unknown collection' }, { status: 400 });
  }

  let keys: ReturnType<typeof objectKeys>;
  try {
    keys = objectKeys(collectionId, photoId, extension);
  } catch {
    return NextResponse.json({ error: 'invalid key components' }, { status: 400 });
  }

  try {
    // Thumbnail and preview are always WebP — that's not the caller's
    // choice, it's what derivatives.ts produces, so their content type is
    // never taken from the request.
    //
    // It MUST match what the browser actually PUTs. A SigV4 presigned URL
    // signs the content type, so signing image/jpeg while the client sends
    // image/webp makes B2 refuse with SignatureDoesNotMatch — and B2's error
    // response carries no Access-Control-Allow-Origin, so the browser hands
    // XHR a status-0 onerror that looks exactly like a missing CORS rule.
    // That is precisely how switching derivatives to WebP broke every upload
    // while pointing the blame at the bucket. See DERIVATIVE_CONTENT_TYPE.
    const [thumbnail, preview, original] = await Promise.all([
      signedPutUrl(keys.thumbnail_key, DERIVATIVE_CONTENT_TYPE),
      signedPutUrl(keys.preview_key, DERIVATIVE_CONTENT_TYPE),
      signedPutUrl(keys.original_key, contentType),
    ]);
    return NextResponse.json({ keys, urls: { thumbnail, preview, original } });
  } catch (error) {
    // Never echo the underlying message: it can name configuration.
    console.error('presign failed', error);
    return NextResponse.json({ error: 'Could not sign upload' }, { status: 500 });
  }
}
