import test from 'node:test';
import assert from 'node:assert/strict';

import { galleryUrl } from './site-url.ts';

// The shape the site actually serves: _Website/src/pages/g/[token]/index.astro.
test('a gallery link matches the route the site serves', () => {
  assert.equal(
    galleryUrl('abc123', 'https://method26.intellidot.workers.dev'),
    'https://method26.intellidot.workers.dev/g/abc123/'
  );
});

test('a trailing slash on the site URL does not double up', () => {
  assert.equal(galleryUrl('abc123', 'https://method26.com/'), 'https://method26.com/g/abc123/');
  assert.equal(galleryUrl('abc123', 'https://method26.com///'), 'https://method26.com/g/abc123/');
});
