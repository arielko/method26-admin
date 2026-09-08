// Pure aggregation logic for the gallery analytics views. Kept free of any
// Supabase/network dependency so it can be unit tested directly — the
// queries.ts wrappers do nothing but fetch narrow columns and hand the rows
// to these functions.

export type FavoriteRow = { photo_id: string; visitor_id: string | null };

export type ConsensusEntry = {
  photoId: string;
  likeCount: number;
  visitorIds: string[];
};

// Frames ranked by how many DIFFERENT visitors picked them. This is the
// view the studio retouches from, and the reason favorites carry a
// visitor_id at all now.
//
// A favorite with no visitor_id (email capture was off, or the row predates
// visitor tracking) cannot be attributed to any particular person, so it
// cannot make this photo distinguishable from "one visitor favorited it
// twice" — it is excluded from the count rather than silently inflating it.
// Callers should tell the studio when a gallery has capture disabled rather
// than showing a consensus table that just looks empty.
export function rankConsensus(favorites: FavoriteRow[]): ConsensusEntry[] {
  const byPhoto = new Map<string, Set<string>>();
  for (const favorite of favorites) {
    if (favorite.visitor_id === null) continue;
    const visitors = byPhoto.get(favorite.photo_id) ?? new Set<string>();
    visitors.add(favorite.visitor_id);
    byPhoto.set(favorite.photo_id, visitors);
  }
  return Array.from(byPhoto.entries())
    .map(([photoId, visitors]) => ({
      photoId,
      likeCount: visitors.size,
      visitorIds: Array.from(visitors),
    }))
    .sort((a, b) => b.likeCount - a.likeCount || a.photoId.localeCompare(b.photoId));
}

export type GroupedFavorites = {
  // One entry per visitor who favorited at least one frame.
  byVisitor: { visitorId: string; photoIds: string[] }[];
  // Favorites with no visitor_id — capture was off, so who picked these is
  // unknowable, not merely unrecorded.
  unattributedPhotoIds: string[];
};

export function groupFavoritesByVisitor(favorites: FavoriteRow[]): GroupedFavorites {
  const byVisitor = new Map<string, string[]>();
  const unattributed: string[] = [];
  for (const favorite of favorites) {
    if (favorite.visitor_id === null) {
      unattributed.push(favorite.photo_id);
      continue;
    }
    const list = byVisitor.get(favorite.visitor_id) ?? [];
    list.push(favorite.photo_id);
    byVisitor.set(favorite.visitor_id, list);
  }
  return {
    byVisitor: Array.from(byVisitor.entries()).map(([visitorId, photoIds]) => ({ visitorId, photoIds })),
    unattributedPhotoIds: unattributed,
  };
}

// Counts rows per visitor_id, dropping anonymous (null) rows — used to
// derive per-visitor view/download counts without a second network round
// trip per visitor.
export function countByVisitor(rows: { visitor_id: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.visitor_id === null) continue;
    counts.set(row.visitor_id, (counts.get(row.visitor_id) ?? 0) + 1);
  }
  return counts;
}

export type DayActivity = { date: string; views: number; downloads: number };

// Buckets raw view/download timestamps into a fixed run of `days` calendar
// days ending today (UTC, yyyy-mm-dd), oldest first — the shape the
// Analytics Overview "Last 30 Days" chart draws directly, bar by bar, with
// every day represented even when it had zero activity (a gap in the chart
// would otherwise be indistinguishable from a gap in the data).
export function bucketActivityByDay(
  views: { viewed_at: string }[],
  downloads: { downloaded_at: string }[],
  days = 30,
  now: Date = new Date()
): DayActivity[] {
  const toDateKey = (iso: string) => iso.slice(0, 10);
  const viewCounts = new Map<string, number>();
  for (const v of views) {
    const key = toDateKey(v.viewed_at);
    viewCounts.set(key, (viewCounts.get(key) ?? 0) + 1);
  }
  const downloadCounts = new Map<string, number>();
  for (const d of downloads) {
    const key = toDateKey(d.downloaded_at);
    downloadCounts.set(key, (downloadCounts.get(key) ?? 0) + 1);
  }

  const result: DayActivity[] = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const key = cursor.toISOString().slice(0, 10);
    result.push({ date: key, views: viewCounts.get(key) ?? 0, downloads: downloadCounts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
