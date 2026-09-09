import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankConsensus,
  splitConsensus,
  groupFavoritesByVisitor,
  countByVisitor,
  bucketActivityByDay,
} from './analytics.ts';

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

test('bucketActivityByDay returns exactly `days` entries, oldest first, ending on `now`', () => {
  const now = new Date('2026-01-15T12:00:00Z');
  const buckets = bucketActivityByDay([], [], 5, now);
  assert.deepEqual(
    buckets.map((b) => b.date),
    ['2026-01-11', '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15']
  );
});

test('bucketActivityByDay counts views and downloads into the calendar day they fall on', () => {
  const now = new Date('2026-01-15T12:00:00Z');
  const buckets = bucketActivityByDay(
    [{ viewed_at: '2026-01-14T08:00:00Z' }, { viewed_at: '2026-01-14T23:00:00Z' }, { viewed_at: '2026-01-15T01:00:00Z' }],
    [{ downloaded_at: '2026-01-15T09:30:00Z' }],
    5,
    now
  );
  const jan14 = buckets.find((b) => b.date === '2026-01-14')!;
  const jan15 = buckets.find((b) => b.date === '2026-01-15')!;
  assert.equal(jan14.views, 2);
  assert.equal(jan14.downloads, 0);
  assert.equal(jan15.views, 1);
  assert.equal(jan15.downloads, 1);
});

test('bucketActivityByDay fills every day with zero, not a gap, when there is no activity', () => {
  const buckets = bucketActivityByDay([], [], 3, new Date('2026-01-15T12:00:00Z'));
  assert.deepEqual(buckets.every((b) => b.views === 0 && b.downloads === 0), true);
  assert.equal(buckets.length, 3);
});

// Argento shows two blocks — "Overlaps" (2+ votes, the badge counts these)
// and "All Other Likes" (a single vote each). Method26 rendered one grid of
// everything under a badge reading "N photos liked by 2+", so a link where
// four people each picked a different frame reported "4 photos liked by 2+".
test('splitConsensus separates frames with two or more votes from single votes', () => {
  const { overlaps, singles } = splitConsensus([
    { photoId: 'p1', likeCount: 3, visitorIds: ['a', 'b', 'c'] },
    { photoId: 'p2', likeCount: 2, visitorIds: ['a', 'b'] },
    { photoId: 'p3', likeCount: 1, visitorIds: ['a'] },
  ]);
  assert.deepEqual(overlaps.map((f) => f.photoId), ['p1', 'p2']);
  assert.deepEqual(singles.map((f) => f.photoId), ['p3']);
});

test('splitConsensus: every frame at one vote leaves overlaps empty', () => {
  const { overlaps, singles } = splitConsensus([
    { photoId: 'p1', likeCount: 1, visitorIds: ['a'] },
    { photoId: 'p2', likeCount: 1, visitorIds: ['b'] },
  ]);
  assert.deepEqual(overlaps, []);
  assert.equal(singles.length, 2);
});

test('splitConsensus preserves the ranking it was given', () => {
  const { overlaps } = splitConsensus([
    { photoId: 'p1', likeCount: 5, visitorIds: [] },
    { photoId: 'p2', likeCount: 2, visitorIds: [] },
  ]);
  assert.deepEqual(overlaps.map((f) => f.likeCount), [5, 2]);
});
