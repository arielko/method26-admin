import test from 'node:test';
import assert from 'node:assert/strict';

import { galleryUrl, finalsUrl, urlForVariant } from './site-url.ts';

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

test('the retouched email links to the retouched files, not the picking wall', () => {
  // The bug: a client was told "your retouched photos are ready for
  // download", clicked Download Photos, and landed on the proofing cover
  // page — a step to click through and then a wall of frames to pick from,
  // with the files they were promised nowhere in sight.
  assert.equal(
    urlForVariant('abc123', 'finals', 'https://method26.com'),
    'https://method26.com/g/abc123/finals'
  );
});

test('the proofing email still links to the proofing surface', () => {
  assert.equal(
    urlForVariant('abc123', 'proofing', 'https://method26.com'),
    'https://method26.com/g/abc123/'
  );
  // An unset variant is the proofing default everywhere else in this system.
  assert.equal(urlForVariant('abc123', undefined, 'https://method26.com'), 'https://method26.com/g/abc123/');
});

test('the finals path matches the route the site serves', () => {
  // _Website/src/pages/g/[token]/finals.astro — no trailing slash, because
  // that page is prerendered as /g/<token>/finals and a slash would redirect.
  assert.equal(finalsUrl('abc123', 'https://method26.com/'), 'https://method26.com/g/abc123/finals');
  assert.ok(!finalsUrl('abc123', 'https://method26.com').endsWith('/'));
});
