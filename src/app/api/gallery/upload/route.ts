import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { signedPutUrl } from '@/lib/gallery/b2';
import { objectKeys } from '@/lib/gallery/keys';
import { collectionExists } from '@/lib/gallery/queries';
import { DERIVATIVE_CONTENT_TYPE } from '../presign/route';

// The fallback behind the direct-to-B2 upload, mirroring the proxy path the
// Argento system this is modelled on has always carried.
//
// A browser PUT straight to B2 is the fast path and stays the default: the
// bytes never touch us. But it depends on a bucket CORS rule holding, and
// when B2 refuses a request for any reason its error response carries no
// Access-Control-Allow-Origin — so the browser hands XHR a status-0 failure
// with no body and no status. From the client, "the rule is missing", "the
// signature is wrong" and "the network dropped" are the same event.
//
// Going through here removes CORS from the question entirely: same-origin
// request in, server-side PUT out. Slower, and capped by the Worker's request
// body limit, which is why it is a fallback and not the default.
//
// The caller never supplies a raw key — same rule as the presign route. The
// server derives it from (collectionId, photoId, extension, variant), so this
// cannot become a write primitive for arbitrary bucket paths.
const IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION_RE = /^\.[a-z0-9]{1,5}$/i;
const VARIANTS = ['thumbnail', 'preview', 'original'] as const;
type Variant = (typeof VARIANTS)[number];

function isVariant(value: unknown): value is Variant {
  return typeof value === 'string' && (VARIANTS as readonly string[]).includes(value);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 });
  }

  const collectionId = form.get('collectionId');
  const photoId = form.get('photoId');
  const extension = form.get('extension');
  const variant = form.get('variant');
  const file = form.get('file');

  if (
    typeof collectionId !== 'string' ||
    typeof photoId !== 'string' ||
    typeof extension !== 'string' ||
    !isVariant(variant) ||
    !(file instanceof Blob)
  ) {
    return NextResponse.json(
      { error: 'collectionId, photoId, extension, variant and file are required' },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(photoId)) {
    return NextResponse.json({ error: 'photoId must be a UUID' }, { status: 400 });
  }
  if (!EXTENSION_RE.test(extension)) {
    return NextResponse.json({ error: 'invalid extension' }, { status: 400 });
  }

  // Derivatives are always what derivatives.ts encodes; only the original's
  // type is caller-supplied, and only from the image set.
  const contentType =
    variant === 'original' ? file.type || 'application/octet-stream' : DERIVATIVE_CONTENT_TYPE;
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
  const key = keys[`${variant === 'thumbnail' ? 'thumbnail' : variant}_key` as keyof typeof keys];

  try {
    const url = await signedPutUrl(key, contentType);
    const upstream = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!upstream.ok) {
      // The status, not the body — B2's error XML echoes the signed URL,
      // which carries this account's key id.
      console.error('proxy upload rejected by B2', upstream.status);
      return NextResponse.json({ error: `B2 rejected the upload (${upstream.status})` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, key });
  } catch (error) {
    console.error('proxy upload failed', error);
    return NextResponse.json({ error: 'Could not reach storage' }, { status: 502 });
  }
}
