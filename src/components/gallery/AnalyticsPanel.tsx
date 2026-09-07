'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Folder, Photo, Gallery } from '@/lib/gallery/types';
import type {
  GalleryOverviewStats,
  FavoriteGroup,
  ConsensusFrame,
  VisitorWithActivity,
  DownloadLogEntry,
} from '@/lib/gallery/queries';
import { PhotoThumb } from './PhotoThumb';

type AnalyticsTab = 'overview' | 'favorites' | 'consensus' | 'visitors' | 'downloads';

const TABS: { id: AnalyticsTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'favorites', label: 'Favourites' },
  { id: 'consensus', label: 'Consensus' },
  { id: 'visitors', label: 'Visitors' },
  { id: 'downloads', label: 'Downloads' },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function AnalyticsPanel({
  folders,
  photos,
  galleries,
}: {
  folders: Folder[];
  photos: Photo[];
  galleries: Gallery[];
}) {
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(galleries[0]?.id ?? null);
  const [tab, setTab] = useState<AnalyticsTab>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<GalleryOverviewStats | null>(null);
  const [favoriteGroups, setFavoriteGroups] = useState<FavoriteGroup[]>([]);
  const [consensus, setConsensus] = useState<ConsensusFrame[]>([]);
  const [visitors, setVisitors] = useState<VisitorWithActivity[]>([]);
  const [downloads, setDownloads] = useState<DownloadLogEntry[]>([]);
  const [emailCaptureEnabled, setEmailCaptureEnabled] = useState(true);
  const [downloadsEnabled, setDownloadsEnabled] = useState(false);

  const storageBytes = useMemo(
    () => photos.reduce((sum, p) => sum + (p.file_size_bytes ?? 0), 0),
    [photos]
  );
  const photosById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const selectedGallery = galleries.find((g) => g.id === selectedGalleryId) ?? null;

  useEffect(() => {
    if (!selectedGalleryId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/gallery/galleries/${selectedGalleryId}/analytics?tab=${tab}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load analytics (${response.status})`);
        return response.json();
      })
      .then((body) => {
        if (cancelled) return;
        if (tab === 'overview') setStats(body.stats);
        if (tab === 'favorites') {
          setFavoriteGroups(body.groups);
          setEmailCaptureEnabled(body.emailCaptureEnabled);
        }
        if (tab === 'consensus') {
          setConsensus(body.frames);
          setEmailCaptureEnabled(body.emailCaptureEnabled);
        }
        if (tab === 'visitors') {
          setVisitors(body.visitors);
          setEmailCaptureEnabled(body.emailCaptureEnabled);
        }
        if (tab === 'downloads') {
          setDownloads(body.downloads);
          setDownloadsEnabled(body.downloadsEnabled);
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedGalleryId, tab]);

  function exportVisitorsCsv() {
    if (!selectedGallery) return;
    const header = 'First name,Last name,Email,First seen,Views,Downloads\n';
    const rows = visitors
      .map((v) =>
        [
          csvField(v.first_name),
          csvField(v.last_name),
          csvField(v.email),
          csvField(new Date(v.created_at).toLocaleDateString()),
          v.viewCount,
          v.downloadCount,
        ].join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedGallery.name.replace(/\s+/g, '-')}-visitors.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stat = (label: string, value: string | number) => (
    <div key={label} className="border border-stone bg-white p-4">
      <p className="text-[11px] uppercase tracking-wide text-ink">{label}</p>
      <p className="mt-1 text-[28px] font-semibold text-ink">{value}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stat('Photographs', photos.length)}
        {stat('Folders', folders.length)}
        {stat('Client links', galleries.length)}
        {stat('Storage used', formatBytes(storageBytes))}
      </div>

      {galleries.length === 0 ? (
        <div className="border border-dashed border-stone py-16 text-center">
          <p className="text-[14px] text-ink">No client links yet.</p>
          <p className="mt-1 text-[12px] text-ink">Publish one to start collecting activity.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {galleries.length > 1 ? (
              <select
                value={selectedGalleryId ?? ''}
                onChange={(e) => setSelectedGalleryId(e.target.value)}
                className="text-[13px]"
              >
                {galleries.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[14px] font-semibold text-ink">{galleries[0].name}</p>
            )}

            <nav className="flex gap-1 border border-stone bg-white p-1" aria-label="Analytics view">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? 'true' : undefined}
                  className={`px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors ${
                    tab === t.id ? 'bg-ink text-paper' : 'text-ink hover:bg-stone'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {error && (
            <p role="alert" className="border border-stone bg-white px-4 py-3 text-[13px] text-ink">
              {error}
            </p>
          )}

          {loading && <p className="text-[13px] text-ink">Loading…</p>}

          {!loading && tab === 'overview' && stats && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {stat('Views', stats.views)}
              {stat('Visitors', stats.visitors)}
              {stat('Favourites', stats.favorites)}
              {stat('Downloads', stats.downloads)}
            </div>
          )}

          {!loading && tab === 'favorites' && (
            <div className="flex flex-col gap-4">
              {!emailCaptureEnabled && (
                <p className="border border-stone bg-white px-4 py-3 text-[12px] text-ink">
                  Email capture is off for this link — favourites are recorded but cannot be attributed to a
                  visitor. Turn it on under Publish → Settings → Access to see who picked what.
                </p>
              )}
              {favoriteGroups.length === 0 ? (
                <p className="text-[13px] text-ink">No favourites marked on this link yet.</p>
              ) : (
                favoriteGroups.map((group, i) => (
                  <div key={group.visitor?.id ?? `unattributed-${i}`} className="border border-stone bg-white p-4">
                    <p className="text-[13px] font-semibold text-ink">
                      {group.visitor ? `${group.visitor.firstName} ${group.visitor.lastName}` : 'No visitor on record'}
                    </p>
                    {group.visitor && <p className="text-[11px] text-ink">{group.visitor.email}</p>}
                    <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                      {group.photos.map((photo) => (
                        <li key={photo.id} className="aspect-square overflow-hidden border border-stone">
                          <PhotoThumb photoId={photo.id} alt={photo.filename} className="h-full w-full object-cover" />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && tab === 'consensus' && (
            <div className="flex flex-col gap-4">
              <p className="text-[12px] text-ink">
                Ranked by how many different visitors picked each frame — this is the set the studio
                retouches from.
              </p>
              {!emailCaptureEnabled && (
                <p className="border border-stone bg-white px-4 py-3 text-[12px] text-ink">
                  Email capture is off for this link, so favourites here carry no visitor identity — consensus
                  cannot be computed until visitors are known.
                </p>
              )}
              {consensus.length === 0 ? (
                <p className="text-[13px] text-ink">No frames with more than one identified favourite yet.</p>
              ) : (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {consensus.map((frame) => (
                    <li key={frame.photoId} className="border border-stone bg-white">
                      <div className="aspect-square overflow-hidden border-b border-stone">
                        <PhotoThumb photoId={frame.photoId} alt={frame.filename} className="h-full w-full object-cover" />
                      </div>
                      <div className="p-2">
                        <p className="text-[11px] font-semibold text-ink">
                          {frame.likeCount} visitor{frame.likeCount === 1 ? '' : 's'}
                        </p>
                        <p
                          className="mt-0.5 truncate text-[10px] text-ink"
                          title={frame.likedBy.map((v) => `${v.firstName} ${v.lastName}`).join(', ')}
                        >
                          {frame.likedBy.map((v) => `${v.firstName} ${v.lastName[0] ?? ''}.`).join(', ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!loading && tab === 'visitors' && (
            <div className="flex flex-col gap-3">
              {!emailCaptureEnabled && (
                <p className="border border-stone bg-white px-4 py-3 text-[12px] text-ink">
                  Email capture is off for this link — no visitor identities are collected, so no one will
                  appear here.
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={exportVisitorsCsv}
                  disabled={visitors.length === 0}
                  className="border border-stone px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink hover:border-ink transition-colors disabled:opacity-40"
                >
                  Export CSV
                </button>
              </div>
              {visitors.length === 0 ? (
                <p className="text-[13px] text-ink">No visitors recorded on this link yet.</p>
              ) : (
                <div className="overflow-x-auto border border-stone bg-white">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-stone text-left text-[11px] uppercase tracking-wide text-ink">
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">Email</th>
                        <th className="px-4 py-2 font-medium">First seen</th>
                        <th className="px-4 py-2 font-medium">Views</th>
                        <th className="px-4 py-2 font-medium">Downloads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visitors.map((v) => (
                        <tr key={v.id} className="border-b border-stone last:border-0">
                          <td className="px-4 py-2 text-ink">
                            {v.first_name} {v.last_name}
                          </td>
                          <td className="px-4 py-2 text-ink">{v.email}</td>
                          <td className="px-4 py-2 text-ink">{new Date(v.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-2 text-ink">{v.viewCount}</td>
                          <td className="px-4 py-2 text-ink">{v.downloadCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!loading && tab === 'downloads' && (
            <div className="flex flex-col gap-3">
              {!downloadsEnabled && (
                <p className="border border-stone bg-white px-4 py-3 text-[12px] text-ink">
                  Downloads are off for this link — nothing new will be logged here until they&rsquo;re
                  enabled under Publish → Settings → Downloads.
                </p>
              )}
              {downloads.length === 0 ? (
                <p className="text-[13px] text-ink">No downloads on this link yet.</p>
              ) : (
                <div className="overflow-x-auto border border-stone bg-white">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-stone text-left text-[11px] uppercase tracking-wide text-ink">
                        <th className="px-4 py-2 font-medium">Photo</th>
                        <th className="px-4 py-2 font-medium">Visitor</th>
                        <th className="px-4 py-2 font-medium">Downloaded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {downloads.map((d, i) => (
                        <tr key={i} className="border-b border-stone last:border-0">
                          <td className="px-4 py-2 text-ink">
                            {d.filename ?? photosById.get(d.photoId ?? '')?.filename ?? '—'}
                          </td>
                          <td className="px-4 py-2 text-ink">
                            {d.visitor ? `${d.visitor.firstName} ${d.visitor.lastName}` : 'Anonymous'}
                          </td>
                          <td className="px-4 py-2 text-ink">{new Date(d.downloadedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
