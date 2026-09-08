import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { objectKeys, photoKeysMatchLayout } from './keys.ts';

test('object keys are namespaced by collection and photo', () => {
  const keys = objectKeys('c-1', 'p-1', '.jpg');
  assert.equal(keys.thumbnail_key, 'c-1/p-1/thumb.webp');
  assert.equal(keys.preview_key, 'c-1/p-1/preview.webp');
  assert.equal(keys.original_key, 'c-1/p-1/original.jpg');
});

test('all three derivatives are produced — the preview is not optional', () => {
  // The public proofing surface serves the preview in its lightbox. A photo
  // stored without one leaves a client judging frames from a 600px tile.
  const keys = objectKeys('c-1', 'p-1', '.jpg');
  assert.deepEqual(Object.keys(keys).sort(), ['original_key', 'preview_key', 'thumbnail_key']);
});

test('the original keeps its own extension, the derivatives are webp', () => {
  const keys = objectKeys('c-1', 'p-1', '.png');
  assert.equal(keys.original_key, 'c-1/p-1/original.png');
  assert.equal(keys.thumbnail_key, 'c-1/p-1/thumb.webp');
});

test('rows written before the WebP switch still validate', () => {
  // Every photograph already in the bucket has thumb.jpg / preview.jpg keys
  // pointing at real objects. Tightening the layout check to webp-only would
  // have invalidated the entire existing library.
  assert.ok(
    photoKeysMatchLayout('c-1', {
      thumbnail_key: 'c-1/p-1/thumb.jpg',
      preview_key: 'c-1/p-1/preview.jpg',
      original_key: 'c-1/p-1/original.jpg',
    })
  );
});

test('keys cannot climb out of their namespace', () => {
  assert.throws(() => objectKeys('../c', 'p-1', '.jpg'), /invalid/i);
  assert.throws(() => objectKeys('c-1', '../p', '.jpg'), /invalid/i);
  assert.throws(() => objectKeys('c-1', 'p-1', '../x'), /invalid/i);
});

test('photoKeysMatchLayout accepts a row whose keys were minted for that collection', () => {
  const keys = objectKeys('collection-a', 'photo-1', '.jpg');
  assert.equal(photoKeysMatchLayout('collection-a', keys), true);
});

test('photoKeysMatchLayout rejects keys minted for a different collection', () => {
  // This is the I-5 cross-collection case: a folder_id from one collection
  // paired with keys that actually live under another. Left unchecked, the
  // row renders in the grid while every tile 404s against the bucket.
  const keys = objectKeys('collection-a', 'photo-1', '.jpg');
  assert.equal(photoKeysMatchLayout('collection-b', keys), false);
});

test('photoKeysMatchLayout rejects keys whose three derivatives do not share a photo id', () => {
  const a = objectKeys('collection-a', 'photo-1', '.jpg');
  const b = objectKeys('collection-a', 'photo-2', '.jpg');
  assert.equal(
    photoKeysMatchLayout('collection-a', { ...a, preview_key: b.preview_key }),
    false
  );
});

test('photoKeysMatchLayout rejects a key that does not name the derivative it claims to be', () => {
  const keys = objectKeys('collection-a', 'photo-1', '.jpg');
  assert.equal(
    photoKeysMatchLayout('collection-a', { ...keys, thumbnail_key: keys.preview_key }),
    false
  );
});

test('the encoder, the signature and the PUT all name the same content type', () => {
  // The regression this pins: derivatives.ts was switched to WebP while the
  // presign route still signed image/jpeg. A SigV4 presigned URL signs the
  // content type, so B2 refused every derivative with SignatureDoesNotMatch —
  // and because B2's error response carries no Access-Control-Allow-Origin,
  // the browser reported it as a status-0 network failure that read exactly
  // like a missing CORS rule. Every upload broke and the message blamed the
  // bucket. These three must be read together or not at all.
  const derivatives = readFileSync('src/lib/gallery/derivatives.ts', 'utf8');
  const presign = readFileSync('src/app/api/gallery/presign/route.ts', 'utf8');
  const upload = readFileSync('src/lib/gallery/upload.ts', 'utf8');

  const encoded = new Set([...derivatives.matchAll(/fileType:\s*'([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...encoded], ['image/webp'], 'derivatives.ts encodes exactly one type');

  assert.match(
    presign,
    /export const DERIVATIVE_CONTENT_TYPE = 'image\/webp'/,
    'the signature must name the same type the encoder produces'
  );
  assert.match(
    presign,
    /signedPutUrl\(keys\.thumbnail_key, DERIVATIVE_CONTENT_TYPE\)/,
    'and both derivative signatures must use it'
  );
  assert.match(presign, /signedPutUrl\(keys\.preview_key, DERIVATIVE_CONTENT_TYPE\)/);

  const put = [...upload.matchAll(/send\('(thumbnail|preview)', urls\.\w+, \w+, '([^']+)'/g)];
  assert.equal(put.length, 2, 'both derivative PUTs state their content type');
  for (const [, which, type] of put) {
    assert.equal(type, 'image/webp', `the ${which} PUT must send what was signed`);
  }
});

test('the derivative object name follows the derivative bytes', () => {
  // An object called thumb.jpg holding WebP is a lie that survives every code
  // review and only surfaces when somebody downloads it.
  const keys = objectKeys('c', 'p', '.cr2');
  assert.ok(keys.thumbnail_key.endsWith('.webp'));
  assert.ok(keys.preview_key.endsWith('.webp'));
});
