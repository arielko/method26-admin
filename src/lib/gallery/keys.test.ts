import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objectKeys, photoKeysMatchLayout } from './keys.ts';

test('object keys are namespaced by collection and photo', () => {
  const keys = objectKeys('c-1', 'p-1', '.jpg');
  assert.equal(keys.thumbnail_key, 'c-1/p-1/thumb.jpg');
  assert.equal(keys.preview_key, 'c-1/p-1/preview.jpg');
  assert.equal(keys.original_key, 'c-1/p-1/original.jpg');
});

test('all three derivatives are produced — the preview is not optional', () => {
  // The public proofing surface serves the preview in its lightbox. A photo
  // stored without one leaves a client judging frames from a 600px tile.
  const keys = objectKeys('c-1', 'p-1', '.jpg');
  assert.deepEqual(Object.keys(keys).sort(), ['original_key', 'preview_key', 'thumbnail_key']);
});

test('the original keeps its own extension, the derivatives are jpeg', () => {
  const keys = objectKeys('c-1', 'p-1', '.png');
  assert.equal(keys.original_key, 'c-1/p-1/original.png');
  assert.equal(keys.thumbnail_key, 'c-1/p-1/thumb.jpg');
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
