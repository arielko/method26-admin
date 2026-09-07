'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Collection, Folder, Photo, Gallery } from '@/lib/gallery/types';
import { PhotosPanel } from './PhotosPanel';
import { PublishPanel } from './PublishPanel';
import { AnalyticsPanel } from './AnalyticsPanel';

type View = 'photos' | 'publish' | 'analytics';

const TABS: { id: View; label: string }[] = [
  { id: 'photos', label: 'Photos' },
  { id: 'publish', label: 'Publish' },
  { id: 'analytics', label: 'Analytics' },
];

export function CollectionDetail({
  collection,
  folders,
  photos,
  galleries,
  hidden,
  favorites,
}: {
  collection: Collection;
  folders: Folder[];
  photos: Photo[];
  galleries: Gallery[];
  hidden: Record<string, string[]>;
  favorites: Record<string, string[]>;
}) {
  const [view, setView] = useState<View>('photos');
  const router = useRouter();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="border-b border-stone pb-6">
        <Link href="/gallery" className="text-[12px] uppercase tracking-wide text-ink">
          ← Galleries
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold text-ink">{collection.name}</h1>
            <p className="mt-1 text-[13px] text-ink">
              {photos.length} photograph{photos.length === 1 ? '' : 's'} · {folders.length} folder
              {folders.length === 1 ? '' : 's'} · {galleries.length} link{galleries.length === 1 ? '' : 's'}
            </p>
          </div>
          <nav className="flex gap-1 border border-stone bg-white p-1" aria-label="Collection view">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                aria-current={view === tab.id ? 'true' : undefined}
                className={`relative px-4 py-2 text-[12px] font-medium uppercase tracking-wide transition-colors ${
                  view === tab.id ? 'bg-ink text-paper' : 'text-ink hover:bg-stone'
                }`}
              >
                {tab.label}
                {view === tab.id && (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-amber" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="mt-8">
        {view === 'photos' && (
          <PhotosPanel
            collectionId={collection.id}
            folders={folders}
            photos={photos}
            onChanged={() => router.refresh()}
          />
        )}
        {view === 'publish' && (
          <PublishPanel
            collectionId={collection.id}
            galleries={galleries}
            folders={folders}
            hidden={hidden}
            onChanged={() => router.refresh()}
          />
        )}
        {view === 'analytics' && (
          <AnalyticsPanel
            folders={folders}
            photos={photos}
            galleries={galleries}
            favorites={favorites}
          />
        )}
      </div>
    </div>
  );
}
