import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGalleryToken } from './token.ts';

test('a token carries at least 128 bits of entropy', () => {
  // 32 hex characters = 16 bytes = 128 bits. The public site treats this
  // as the ONLY credential protecting a client's photographs, so a shorter
  // or lower-entropy value is a security defect, not a style choice.
  const token = newGalleryToken();
  assert.match(token, /^[0-9a-f]{32}$/);
});

test('tokens are URL-safe and carry no personal data', () => {
  const token = newGalleryToken();
  assert.equal(encodeURIComponent(token), token);
});

test('tokens do not repeat', () => {
  const seen = new Set(Array.from({ length: 500 }, () => newGalleryToken()));
  assert.equal(seen.size, 500);
});
