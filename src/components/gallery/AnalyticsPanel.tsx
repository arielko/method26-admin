'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Heart, MailCheck, Mail, HardDrive, FileDown, Users, Search } from 'lucide-react';
import type { Photo, Gallery } from '@/lib/gallery/types';
import type {
  GalleryOverviewStats,
  FavoriteGroup,
  ConsensusFrame,
  VisitorWithActivity,
  DownloadLogEntry,
  GalleryEmail,
} from '@/lib/gallery/queries';
import { splitConsensus } from '@/lib/gallery/analytics';
import { captureNotice, type AttributionTab } from '@/lib/gallery/attribution';
import { PhotoThumb } from './PhotoThumb';

type AnalyticsTab = 'overview' | 'favorites' | 'consensus' | 'visitors' | 'downloads' | 'emails';

const TABS: { id: AnalyticsTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'consensus', label: 'Consensus' },
  { id: 'visitors', label: 'Visitor Emails' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'emails', label: 'Emails Sent' },
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

// One banner shape for all three tabs. Renders nothing when there is
// nothing honest to say — see attribution.ts for which claim is safe when.
function CaptureNotice({
  tab,
  emailCaptureEnabled,
  attributed,
  unattributed,
}: {
  tab: AttributionTab;
  emailCaptureEnabled: boolean;
  attributed: number;
  unattributed: number;
}) {
  const notice = captureNotice(tab, { emailCaptureEnabled, attributed, unattributed });
  if (!notice) return null;
  return (
    <p className="border border-stone bg-white px-4 py-3 text-[12px] text-ink">{notice}</p>
  );
}

// One frame in the consensus grid. Amber-bordered when two or more people
// picked it, plain when it is a single vote.
function ConsensusCard({ frame, isOverlap }: { frame: ConsensusFrame; isOverlap: boolean }) {
  return (
    <li className={`relative border bg-white ${isOverlap ? 'border-amber' : 'border-stone'}`}>
      <div className="aspect-[4/3] overflow-hidden border-b border-stone">
        <PhotoThumb photoId={frame.photoId} alt={frame.filename} className="h-full w-full object-cover" />
      </div>
      {/* The vote count as a badge on the frame, so a glance across the grid
          ranks it without reading captions. Amber is the ground with ink on
          it — amber is 2.84:1 and cannot carry text itself. */}
      <span
        className={`absolute right-2 top-2 flex items-center gap-1 px-1.5 py-0.5 font-mono text-[11px] text-ink ${
          isOverlap ? 'bg-amber' : 'bg-paper'
        }`}
      >
        <Heart className="h-3 w-3 fill-ink" aria-hidden />
        {frame.likeCount}
      </span>
      <div className="p-2">
        <p className="truncate font-mono text-[10px] text-ink" title={frame.filename}>
          {frame.filename}
        </p>
        {/* Initials, not full names: at six columns a name list wraps or
            truncates to uselessness, and the full list is one hover away. */}
        <p
          className="mt-0.5 truncate font-mono text-[10px] text-ink/70"
          title={frame.likedBy.map((v) => `${v.firstName} ${v.lastName}`).join(', ')}
        >
          {frame.likedBy
            .map((v) => `${v.firstName[0] ?? ''}${v.lastName[0] ?? ''}`.toUpperCase())
            .join(', ')}
        </p>
      </div>
    </li>
  );
}

// Reference: GalleryAnalytics.tsx — six tabs, an Overview stat-card row
// (each with an icon and a large number) and a "Last 30 Days" views/
// downloads bar chart.
export function AnalyticsPanel({
  photos,
  galleries,
}: {
  photos: Photo[];
  galleries: Gallery[];
}) {
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(galleries[0]?.id ?? null);
  const [tab, setTab] = useState<AnalyticsTab>('overview');
  // Frame numbers live in the filename — "1005", "DSC4746" — so one text
  // filter over it is what "find frame 1005" actually needs. Substring, not
  // prefix: the studio and the client both say the number, not the whole name.
  const [consensusQuery, setConsensusQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<GalleryOverviewStats | null>(null);
  const [favoriteGroups, setFavoriteGroups] = useState<FavoriteGroup[]>([]);
  const [consensus, setConsensus] = useState<ConsensusFrame[]>([]);
  const [visitors, setVisitors] = useState<VisitorWithActivity[]>([]);
  const [downloads, setDownloads] = useState<DownloadLogEntry[]>([]);
  const [emails, setEmails] = useState<GalleryEmail[]>([]);
  const [emailCaptureEnabled, setEmailCaptureEnabled] = useState(true);
  const [downloadsEnabled, setDownloadsEnabled] = useState(false);

  // Case-insensitive substring over the filename: typing 1005 finds
  // Danielle1005.jpg without the studio having to remember the prefix.
  const visibleConsensus = useMemo(() => {
    const q = consensusQuery.trim().toLowerCase();
    if (q.length === 0) return consensus;
    return consensus.filter((frame) => frame.filename.toLowerCase().includes(q));
  }, [consensus, consensusQuery]);

  // Overlaps are the retouch set; singles are still somebody's pick and are
  // shown under their own heading rather than counted into "liked by 2+".
  const { overlaps, singles } = useMemo(() => splitConsensus(visibleConsensus), [visibleConsensus]);

  // How many rows on each tab actually carry a visitor identity. The
  // notices below read this, not the setting alone — see attribution.ts.
  const attributedFavorites = useMemo(
    () => favoriteGroups.filter((g) => g.visitor !== null).length,
    [favoriteGroups]
  );
  const attributedConsensus = useMemo(
    () => consensus.filter((f) => f.likedBy.length > 0).length,
    [consensus]
  );

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
        if (tab === 'overview') {
          setStats(body.stats);
        }
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
        if (tab === 'emails') {
          setEmails(body.emails);
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

  if (galleries.length === 0) {
    return (
      <div className="border border-dashed border-stone py-16 text-center">
        <p className="text-[14px] text-ink">No galleries published yet.</p>
        <p className="mt-1 text-[12px] text-ink">Publish one under Galleries to start collecting activity.</p>
      </div>
    );
  }

  // Scaled to downloads alone. While views were in this max, a single view

  return (
    <div className="flex flex-col gap-6">
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
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-stone" aria-label="Analytics view">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'true' : undefined}
            className={`border-b-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wide transition-colors ${
              tab === t.id ? 'border-ink text-ink' : 'border-transparent text-ink/60 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="border border-stone bg-white px-4 py-3 text-[13px] text-ink">
          {error}
        </p>
      )}

      {loading && <p className="text-[13px] text-ink">Loading…</p>}

      {!loading && tab === 'overview' && stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {(
              [
                // Views are still recorded (gallery_views), just not shown:
                // a page-view count answers nothing the studio acts on, and
                // it dominated the 30-day chart's scale so downloads — the
                // number that does matter — were invisible beside it.
                { label: 'Downloads', value: stats.downloads, icon: Download },
                { label: 'Favorites', value: stats.favorites, icon: Heart },
                { label: 'Emails Captured', value: stats.visitors, icon: MailCheck },
                // Delivered, not attempted — a failed send doesn't count
                // here. See the Emails Sent tab for the full log, failures
                // included.
                { label: 'Emails Sent', value: stats.emailsSent, icon: Mail },
                { label: 'Storage', value: formatBytes(storageBytes), icon: HardDrive },
              ] as const
            ).map(({ label, value, icon: Icon }) => (
              <div key={label} className="border border-stone bg-white p-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-ink/60" aria-hidden />
                  <p className="text-[11px] uppercase tracking-wide text-ink">{label}</p>
                </div>
                <p className="mt-1 text-[28px] font-semibold text-ink">{value}</p>
              </div>
            ))}
        </div>
      )}

      {!loading && tab === 'favorites' && (
        <div className="flex flex-col gap-4">
          <CaptureNotice
            tab="favorites"
            emailCaptureEnabled={emailCaptureEnabled}
            attributed={attributedFavorites}
            unattributed={favoriteGroups.length - attributedFavorites}
          />
          {favoriteGroups.length === 0 ? (
            <p className="text-[13px] text-ink">No favorites marked on this link yet.</p>
          ) : (
            favoriteGroups.map((group, i) => (
              <div key={group.visitor?.id ?? `unattributed-${i}`} className="border border-stone bg-white p-4">
                {/* One block per person, with their count on the right — the
                    studio's question here is "what did THIS client pick", and
                    the count answers "have they finished choosing" without
                    scrolling the grid. */}
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="flex items-center gap-2 text-[13px] text-ink">
                    <Users className="h-3.5 w-3.5 shrink-0 text-ink/60" aria-hidden />
                    <span className="font-semibold">
                      {group.visitor ? `${group.visitor.firstName} ${group.visitor.lastName}` : 'No visitor on record'}
                    </span>
                    {group.visitor && <span className="text-ink/70">({group.visitor.email})</span>}
                  </p>
                  <p className="font-mono text-[11px] text-ink">
                    {group.photos.length} favorite{group.photos.length === 1 ? '' : 's'}
                  </p>
                </div>
                <ul className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                  {group.photos.map((photo) => (
                    <li key={photo.id} className="border border-stone">
                      {/* 4:3, not square: these are headshots, and a square
                          crop cuts the top of the frame off the thumbnail. */}
                      <div className="aspect-[4/3] overflow-hidden">
                        <PhotoThumb photoId={photo.id} alt={photo.filename} className="h-full w-full object-cover" />
                      </div>
                      {/* The filename is how the studio and the client refer
                          to a frame out loud — it is the point of the list. */}
                      <p className="truncate bg-paper px-1.5 py-1 font-mono text-[10px] text-ink" title={photo.filename}>
                        {photo.filename}
                      </p>
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
          <CaptureNotice
            tab="consensus"
            emailCaptureEnabled={emailCaptureEnabled}
            attributed={attributedConsensus}
            unattributed={consensus.length - attributedConsensus}
          />
          {consensus.length > 0 && (
            <label className="flex items-center gap-2 border border-stone bg-white px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-ink/60" aria-hidden />
              <span className="sr-only">Search by filename or frame number</span>
              <input
                type="search"
                value={consensusQuery}
                onChange={(e) => setConsensusQuery(e.target.value)}
                placeholder="Search by filename or number…"
                className="w-full border-0 bg-transparent p-0 text-[13px] text-ink outline-none"
              />
            </label>
          )}

          {consensus.length === 0 ? (
            <p className="text-[13px] text-ink">No identified favorites on this link yet.</p>
          ) : visibleConsensus.length === 0 ? (
            <p className="text-[13px] text-ink">
              Nothing matches “{consensusQuery}”.
            </p>
          ) : (
            <>
              {/* Agreement first. The badge counts overlaps ONLY — it used to
                  sit over a grid of everything and report every single-vote
                  frame as "liked by 2+", so four people each picking a
                  different frame read as four-way agreement. */}
              {overlaps.length > 0 && (
                <>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink">Overlaps</p>
                    <span className="bg-amber/15 px-2 py-0.5 font-mono text-[11px] text-ink">
                      {overlaps.length} photo{overlaps.length === 1 ? '' : 's'} liked by 2+
                    </span>
                  </div>
                  <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                    {overlaps.map((frame) => (
                      <ConsensusCard key={frame.photoId} frame={frame} isOverlap />
                    ))}
                  </ul>
                </>
              )}

              {/* A single vote is still somebody's pick, and the studio still
                  needs to see it — just not counted as agreement. Stone
                  border rather than amber keeps the two blocks separable at
                  a glance. */}
              {singles.length > 0 && (
                <>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink">
                      All other likes
                    </p>
                    <span className="bg-paper px-2 py-0.5 font-mono text-[11px] text-ink">
                      {singles.length} photo{singles.length === 1 ? '' : 's'} liked by one person
                    </span>
                  </div>
                  <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                    {singles.map((frame) => (
                      <ConsensusCard key={frame.photoId} frame={frame} isOverlap={false} />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}

      {!loading && tab === 'visitors' && (
        <div className="flex flex-col gap-3">
          <CaptureNotice
            tab="visitors"
            emailCaptureEnabled={emailCaptureEnabled}
            attributed={visitors.length}
            unattributed={0}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={exportVisitorsCsv}
              disabled={visitors.length === 0}
              className="flex items-center gap-1.5 border border-stone px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink hover:border-ink transition-colors disabled:opacity-40"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
          {visitors.length === 0 ? (
            <p className="text-[13px] text-ink">No visitor emails captured on this link yet.</p>
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
        <div>
          {!downloadsEnabled && (
            <p className="mb-3 border border-stone bg-white px-4 py-3 text-[12px] text-ink">
              Downloads are off for this link — nothing new will be logged here until they&rsquo;re
              enabled under Galleries → Settings → Downloads.
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

      {!loading && tab === 'emails' && (
        <div>
          {emails.length === 0 ? (
            <p className="text-[13px] text-ink">
              No emails sent on this link yet. Use Send on the Galleries tab to email a client their
              gallery.
            </p>
          ) : (
            <div className="overflow-x-auto border border-stone bg-white">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-stone text-left text-[11px] uppercase tracking-wide text-ink">
                    <th className="px-4 py-2 font-medium">Recipient</th>
                    <th className="px-4 py-2 font-medium">Subject</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((e) => {
                    const failed = e.status !== 'sent';
                    return (
                      <tr key={e.id} className="border-b border-stone last:border-0">
                        <td className="px-4 py-2 text-ink">{e.recipient}</td>
                        <td className="px-4 py-2 text-ink">{e.subject}</td>
                        <td className="px-4 py-2 text-ink">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide ${
                              failed ? 'text-red-600' : 'text-ink'
                            }`}
                            title={failed && e.error ? e.error : undefined}
                          >
                            <span aria-hidden className={`h-1.5 w-1.5 ${failed ? 'bg-red-600' : 'bg-amber'}`} />
                            {failed ? 'Failed' : 'Sent'}
                          </span>
                          {failed && e.error && (
                            <span className="ml-2 text-[11px] text-ink/60">{e.error}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-ink">{new Date(e.sent_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
