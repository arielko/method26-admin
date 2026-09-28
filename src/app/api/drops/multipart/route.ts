import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { presign, presignPut, PART_URL_EXPIRY } from '@/lib/drops/r2';
import { dropObjectKey } from '@/lib/drops/keys';
import { dropExists } from '@/lib/drops/queries';

// The signing endpoint behind the browser's multipart upload.
//
// Every action mints a presigned URL and returns it; no bytes pass through
// this Worker. That is not an optimisation — Cloudflare caps an incoming
// request body at 100 MB on Free and Pro plans, so routing multi-gigabyte
// uploads through a Worker is not merely slow, it is impossible.
//
// The caller never supplies a key. It is derived from (dropId, fileId,
// extension) exactly as the single-PUT path does, so a session cannot mint a
// signature for a path outside the transfer it is uploading to.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION_RE = /^(\.[A-Za-z0-9]{1,12})?$/;
const ACTIONS = ['single', 'create', 'sign-part', 'list-parts', 'complete', 'abort'] as const;
type Action = (typeof ACTIONS)[number];

// S3's own bounds. Enforced here as well as trusted from the client, because
// the client computes part numbers and a wrong one silently corrupts an
// upload rather than failing it.
const MAX_PARTS = 10_000;

export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of ${ACTIONS.join(', ')}` }, { status: 400 });
  }

  const { dropId, fileId, extension } = body as {
    dropId?: string;
    fileId?: string;
    extension?: string;
  };
  if (typeof dropId !== 'string' || typeof fileId !== 'string' || typeof extension !== 'string') {
    return NextResponse.json({ error: 'dropId, fileId and extension are required' }, { status: 400 });
  }
  if (!UUID_RE.test(dropId) || !UUID_RE.test(fileId)) {
    return NextResponse.json({ error: 'dropId and fileId must be UUIDs' }, { status: 400 });
  }
  if (!EXTENSION_RE.test(extension)) {
    return NextResponse.json({ error: 'invalid extension' }, { status: 400 });
  }
  if (!(await dropExists(dropId))) {
    return NextResponse.json({ error: 'unknown transfer' }, { status: 400 });
  }

  let key: string;
  try {
    key = dropObjectKey(dropId, fileId, extension);
  } catch {
    return NextResponse.json({ error: 'invalid key components' }, { status: 400 });
  }

  // uploadId is opaque to us but it is interpolated into a signed query, so
  // it is length-bounded and character-checked rather than trusted.
  const uploadId = typeof body.uploadId === 'string' ? body.uploadId : '';
  const needsUploadId = action !== 'create' && action !== 'single';
  if (needsUploadId && (!uploadId || uploadId.length > 400 || /[^\w.~-]/.test(uploadId))) {
    return NextResponse.json({ error: 'a valid uploadId is required' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'single': {
        // Small files skip multipart entirely — one request instead of four,
        // and nothing to gain from resuming a upload that takes seconds.
        // Content-type is bound into this signature (unlike a part's,
        // which has no meaningful type of its own), so a browser cannot
        // store a mislabelled object.
        const contentType = typeof body.contentType === 'string' ? body.contentType : '';
        if (!contentType || contentType.length > 120 || /[^\x20-\x7e]/.test(contentType)) {
          return NextResponse.json({ error: 'invalid content type' }, { status: 400 });
        }
        return NextResponse.json({ key, url: await presignPut(key, contentType) });
      }

      case 'create':
        // POST ?uploads. The browser parses the returned XML for the
        // uploadId — it cannot be minted here without spending a subrequest
        // on every single upload.
        return NextResponse.json({ key, url: await presign('POST', key, { uploads: '' }) });

      case 'sign-part': {
        const partNumber = Number(body.partNumber);
        if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_PARTS) {
          return NextResponse.json({ error: `partNumber must be 1..${MAX_PARTS}` }, { status: 400 });
        }
        // Signed lazily, one part at a time. Signing every part up front
        // would mean a 20 GB upload's last signature expiring long before
        // the bytes reached it.
        return NextResponse.json({
          url: await presign('PUT', key, { partNumber: String(partNumber), uploadId }, PART_URL_EXPIRY),
        });
      }

      case 'list-parts':
        // What makes resume-across-session possible rather than merely
        // retry-within-session: after a reload the browser asks R2 which
        // parts already landed and skips them.
        return NextResponse.json({ url: await presign('GET', key, { uploadId }) });

      case 'complete':
        return NextResponse.json({ url: await presign('POST', key, { uploadId }) });

      case 'abort':
        return NextResponse.json({ url: await presign('DELETE', key, { uploadId }) });
    }
  } catch (error) {
    // Never echo the underlying message: it can name configuration.
    console.error('multipart presign failed', error);
    return NextResponse.json({ error: 'Could not sign the upload' }, { status: 500 });
  }
}
