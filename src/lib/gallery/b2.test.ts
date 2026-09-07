import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.B2_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
process.env.B2_APP_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
process.env.B2_BUCKET = 'method26-gallery';
process.env.B2_REGION = 'us-west-004';

const { signedPutUrl, signedGetUrl } = await import('./b2.ts');

test('addresses the object in the bucket at the B2 S3 endpoint', async () => {
  const url = new URL(await signedPutUrl('c/p/original.jpg', 'image/jpeg'));
  assert.equal(url.host, 's3.us-west-004.backblazeb2.com');
  assert.equal(url.pathname, '/method26-gallery/c/p/original.jpg');
});

test('carries a complete SigV4 query signature', async () => {
  const url = new URL(await signedPutUrl('c/p/original.jpg', 'image/jpeg'));
  assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.ok(url.searchParams.get('X-Amz-Credential')?.includes('us-west-004/s3/aws4_request'));
  assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/);
});

test('signs content-type, so a mismatched upload is rejected by B2', async () => {
  const signed = new URL(await signedPutUrl('c/p/original.jpg', 'image/jpeg'));
  assert.ok(signed.searchParams.get('X-Amz-SignedHeaders')?.includes('content-type'));
});

test('a different content type produces a different signature', async () => {
  const a = new URL(await signedPutUrl('c/p/x.jpg', 'image/jpeg'));
  const b = new URL(await signedPutUrl('c/p/x.jpg', 'image/png'));
  assert.notEqual(a.searchParams.get('X-Amz-Signature'), b.searchParams.get('X-Amz-Signature'));
});

test('expires quickly — an upload URL is not a standing write grant', async () => {
  const url = new URL(await signedPutUrl('c/p/original.jpg', 'image/jpeg'));
  assert.ok(Number(url.searchParams.get('X-Amz-Expires')) <= 900);
});

test('percent-encodes path segments without encoding the separators', async () => {
  const url = new URL(await signedPutUrl('c/a b/c+d.jpg', 'image/jpeg'));
  assert.equal(url.pathname, '/method26-gallery/c/a%20b/c%2Bd.jpg');
});

test('throws rather than returning an unsigned URL when unconfigured', async () => {
  const saved = process.env.B2_APP_KEY;
  delete process.env.B2_APP_KEY;
  await assert.rejects(() => signedPutUrl('c/p/x.jpg', 'image/jpeg'), /not configured/i);
  process.env.B2_APP_KEY = saved;
});

test('signedGetUrl addresses the same object at the B2 S3 endpoint', async () => {
  const url = new URL(await signedGetUrl('c/p/thumb.jpg'));
  assert.equal(url.host, 's3.us-west-004.backblazeb2.com');
  assert.equal(url.pathname, '/method26-gallery/c/p/thumb.jpg');
});

test('signedGetUrl carries a complete SigV4 query signature', async () => {
  const url = new URL(await signedGetUrl('c/p/thumb.jpg'));
  assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.ok(url.searchParams.get('X-Amz-Credential')?.includes('us-west-004/s3/aws4_request'));
  assert.equal(url.searchParams.get('X-Amz-Date') !== null, true);
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/);
});

test('signedGetUrl signs host only — there is no body or content-type on a GET', () => {
  // Asserted via the header list itself rather than by re-deriving the
  // canonical request: content-type must never appear here, or the
  // request the signature covers wouldn't match what a browser actually
  // sends on a GET.
  return signedGetUrl('c/p/thumb.jpg').then((raw) => {
    const url = new URL(raw);
    assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  });
});

test('signedGetUrl expires quickly — a read URL is not a standing grant', async () => {
  const url = new URL(await signedGetUrl('c/p/thumb.jpg'));
  assert.ok(Number(url.searchParams.get('X-Amz-Expires')) <= 900);
});

test('signedGetUrl caps a caller-requested expiry at the same ceiling as the PUT signer', async () => {
  const url = new URL(await signedGetUrl('c/p/thumb.jpg', { expiresIn: 999_999 }));
  assert.ok(Number(url.searchParams.get('X-Amz-Expires')) <= 900);
});

test('signedGetUrl percent-encodes path segments without encoding the separators', async () => {
  const url = new URL(await signedGetUrl('c/a b/c+d.jpg'));
  assert.equal(url.pathname, '/method26-gallery/c/a%20b/c%2Bd.jpg');
});

test('signedGetUrl throws rather than returning an unsigned URL when unconfigured', async () => {
  const saved = process.env.B2_APP_KEY;
  delete process.env.B2_APP_KEY;
  await assert.rejects(() => signedGetUrl('c/p/thumb.jpg'), /not configured/i);
  process.env.B2_APP_KEY = saved;
});
