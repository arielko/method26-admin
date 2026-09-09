import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureNotice } from './attribution.ts';

// A new link captures email, the way argento's does — that is what makes
// Favorites and Consensus mean anything, so it is not left to the column
// default (false) to decide.
test('createGallery captures email on a new link rather than inheriting the column default', () => {
  const source = readFileSync('src/lib/gallery/queries.ts', 'utf8');
  const start = source.indexOf('export async function createGallery');
  assert.notEqual(start, -1, 'createGallery not found in queries.ts');
  const body = source.slice(start, source.indexOf('\n}', start));
  assert.match(
    body,
    /email_capture_enabled:\s*true/,
    'createGallery must set email_capture_enabled explicitly'
  );
});

test('no notice at all while capture is on', () => {
  for (const tab of ['favorites', 'consensus', 'visitors'] as const) {
    assert.equal(
      captureNotice(tab, { emailCaptureEnabled: true, attributed: 0, unattributed: 7 }),
      null
    );
  }
});

test('capture off with nothing attributed says the picks are anonymous', () => {
  const notice = captureNotice('favorites', {
    emailCaptureEnabled: false,
    attributed: 0,
    unattributed: 4,
  });
  assert.match(notice ?? '', /cannot be attributed/);
  assert.match(notice ?? '', /Require name and email/);
});

// The regression this whole change exists for: a link that captured emails
// and then had capture switched off still has named people on record. The
// banner used to read off the setting alone and announce "cannot be
// attributed to a visitor" directly above a list of named clients.
test('capture off but visitors already on record does not claim there are none', () => {
  const notice = captureNotice('favorites', {
    emailCaptureEnabled: false,
    attributed: 6,
    unattributed: 2,
  });
  assert.doesNotMatch(notice ?? '', /cannot be attributed/);
  assert.match(notice ?? '', /from now on|new favorites|New favorites/);
});

test('consensus says it cannot rank only when no identified votes exist', () => {
  assert.match(
    captureNotice('consensus', { emailCaptureEnabled: false, attributed: 0, unattributed: 9 }) ?? '',
    /cannot be ranked/
  );
  assert.doesNotMatch(
    captureNotice('consensus', { emailCaptureEnabled: false, attributed: 5, unattributed: 1 }) ?? '',
    /cannot be ranked/
  );
});

test('visitors tab does not promise an empty table when the table has rows', () => {
  assert.match(
    captureNotice('visitors', { emailCaptureEnabled: false, attributed: 0, unattributed: 0 }) ?? '',
    /no one will appear/
  );
  assert.doesNotMatch(
    captureNotice('visitors', { emailCaptureEnabled: false, attributed: 3, unattributed: 0 }) ?? '',
    /no one will appear/
  );
});
