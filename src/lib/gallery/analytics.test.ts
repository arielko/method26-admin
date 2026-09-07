import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankConsensus, groupFavoritesByVisitor, countByVisitor } from './analytics.ts';

test('rankConsensus counts distinct visitors per photo, not raw favorite rows', () => {
  const ranked = rankConsensus([
    { photo_id: 'p1', visitor_id: 'v1' },
    { photo_id: 'p1', visitor_id: 'v2' },
    { photo_id: 'p2', visitor_id: 'v1' },
  ]);
  assert.deepEqual(
    ranked.map((r) => [r.photoId, r.likeCount]),
    [['p1', 2], ['p2', 1]]
  );
});

test('rankConsensus sorts most-liked first, ties broken by photo id', () => {
  const ranked = rankConsensus([
    { photo_id: 'p2', visitor_id: 'v1' },
    { photo_id: 'p1', visitor_id: 'v1' },
  ]);
  assert.deepEqual(ranked.map((r) => r.photoId), ['p1', 'p2']);
});

test('rankConsensus excludes favorites with no visitor_id entirely', () => {
  // Capture disabled (or a pre-visitor-tracking row) means the favoriter is
  // unknowable — it must not be counted as "a distinct visitor liked this",
  // and it must not silently merge into some other visitor's count either.
  const ranked = rankConsensus([
    { photo_id: 'p1', visitor_id: null },
    { photo_id: 'p1', visitor_id: null },
  ]);
  assert.deepEqual(ranked, []);
});

test('rankConsensus: the same visitor favoriting a photo twice counts once', () => {
  const ranked = rankConsensus([
    { photo_id: 'p1', visitor_id: 'v1' },
    { photo_id: 'p1', visitor_id: 'v1' },
  ]);
  assert.deepEqual(ranked, [{ photoId: 'p1', likeCount: 1, visitorIds: ['v1'] }]);
});

test('rankConsensus on an empty gallery returns an empty ranking, not an error', () => {
  assert.deepEqual(rankConsensus([]), []);
});

test('groupFavoritesByVisitor separates attributed favorites from anonymous ones', () => {
  const grouped = groupFavoritesByVisitor([
    { photo_id: 'p1', visitor_id: 'v1' },
    { photo_id: 'p2', visitor_id: 'v1' },
    { photo_id: 'p3', visitor_id: null },
  ]);
  assert.deepEqual(grouped.byVisitor, [{ visitorId: 'v1', photoIds: ['p1', 'p2'] }]);
  assert.deepEqual(grouped.unattributedPhotoIds, ['p3']);
});

test('groupFavoritesByVisitor: a gallery with capture disabled produces only unattributed favorites', () => {
  const grouped = groupFavoritesByVisitor([
    { photo_id: 'p1', visitor_id: null },
    { photo_id: 'p2', visitor_id: null },
  ]);
  assert.deepEqual(grouped.byVisitor, []);
  assert.deepEqual(grouped.unattributedPhotoIds, ['p1', 'p2']);
});

test('countByVisitor tallies rows per visitor and drops anonymous rows', () => {
  const counts = countByVisitor([
    { visitor_id: 'v1' },
    { visitor_id: 'v1' },
    { visitor_id: 'v2' },
    { visitor_id: null },
  ]);
  assert.equal(counts.get('v1'), 2);
  assert.equal(counts.get('v2'), 1);
  assert.equal(counts.has('null'), false);
  assert.equal(counts.size, 2);
});

test('countByVisitor on no rows returns an empty map', () => {
  assert.equal(countByVisitor([]).size, 0);
});
