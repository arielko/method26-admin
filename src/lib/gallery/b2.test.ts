import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.B2_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
process.env.B2_APP_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
process.env.B2_BUCKET = 'method26-gallery';
process.env.B2_REGION = 'us-west-004';

const { signedPutUrl } = await import('./b2.ts');

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
