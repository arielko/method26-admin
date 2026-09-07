'use client';

import { useMemo, useState } from 'react';
import type { Folder, Photo, Gallery } from '@/lib/gallery/types';
import { PhotoThumb } from './PhotoThumb';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

export function AnalyticsPanel({
  folders,
  photos,
  galleries,
  favorites,
}: {
  folders: Folder[];
  photos: Photo[];
  galleries: Gallery[];
  favorites: Record<string, string[]>;
}) {
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(galleries[0]?.id ?? null);

  const storageBytes = useMemo(
    () => photos.reduce((sum, p) => sum + (p.file_size_bytes ?? 0), 0),
    [photos]
  );

  const photosById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const stats = [
    { label: 'Photographs', value: photos.length },
    { label: 'Folders', value: folders.length },
    { label: 'Client links', value: galleries.length },
    { label: 'Storage used', value: formatBytes(storageBytes) },
  ];

  const selectedFavoriteIds = selectedGalleryId ? (favorites[selectedGalleryId] ?? []) : [];
  const favoritePhotos = selectedFavoriteIds
    .map((id) => photosById.get(id))
    .filter((p): p is Photo => p !== undefined);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="border border-stone bg-white p-4">
            <p className="text-[11px] uppercase tracking-wide text-ink">{stat.label}</p>
            <p className="mt-1 text-[28px] font-semibold text-ink">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="border border-stone bg-white p-4">
        <h2 className="text-[14px] font-semibold text-ink">Favorited frames</h2>
        <p className="mt-1 text-[12px] text-ink">
          Frames a client marked while proofing, by client link.
        </p>

        {galleries.length === 0 ? (
          <p className="mt-4 text-[13px] text-ink">No client links yet — publish one to collect favorites.</p>
        ) : (
          <>
            {galleries.length > 1 && (
              <select
                value={selectedGalleryId ?? ''}
                onChange={(e) => setSelectedGalleryId(e.target.value)}
                className="mt-4 text-[13px]"
              >
                {galleries.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}

            {favoritePhotos.length === 0 ? (
              <p className="mt-4 text-[13px] text-ink">No favorites marked on this link yet.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {favoritePhotos.map((photo) => (
                  <li key={photo.id} className="aspect-square overflow-hidden border border-stone">
                    <PhotoThumb photoId={photo.id} alt={photo.filename} className="h-full w-full object-cover" />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="border border-stone bg-white p-4">
        <p className="text-[12px] text-ink">
          Visitor-level tracking — page views, downloads, and captured emails — is not collected by this
          system. Favorites above are the only per-client signal available; there is no email gate on
          proofing links by design.
        </p>
      </div>
    </div>
  );
}
