'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageOff, Plus } from 'lucide-react';
import type { Collection } from '@/lib/gallery/types';
import { PhotoThumb } from './PhotoThumb';

export function CollectionsView({
  initialCollections,
  photoCounts,
  coverPhotoIds,
}: {
  initialCollections: Collection[];
  photoCounts: Record<string, number>;
  coverPhotoIds: Record<string, string>;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/gallery/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) throw new Error(`Could not create the shoot (${response.status})`);
      const { collection } = (await response.json()) as { collection: Collection };
      setName('');
      setIsCreating(false);
      router.push(`/gallery/${collection.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone pb-6">
        <div>
          <h1 className="text-[28px] font-semibold text-ink">Galleries</h1>
          <p className="mt-1 text-[13px] text-ink">
            {initialCollections.length} shoot{initialCollections.length === 1 ? '' : 's'}
          </p>
        </div>
        {!isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 border border-ink px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-ink hover:bg-ink hover:text-paper transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Collection
          </button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={create} className="mt-6 flex flex-wrap items-end gap-3 border border-stone bg-white p-4">
          <label className="flex flex-1 min-w-[220px] flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink">Shoot name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="e.g. Whitfield family — fall 2026"
              className="w-full text-[14px]"
            />
          </label>
          <button
            type="submit"
            disabled={busy || name.trim().length === 0}
            className="bg-ink px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-paper disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setName('');
              setError(null);
            }}
            className="px-3 py-2 text-[12px] uppercase tracking-wide text-ink"
          >
            Cancel
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 border border-stone bg-white px-4 py-3 text-[13px] text-ink">
          {error}
        </p>
      )}

      {initialCollections.length === 0 ? (
        <div className="mt-16 border border-dashed border-stone py-20 text-center">
          <p className="text-[14px] text-ink">No shoots yet.</p>
          <p className="mt-1 text-[12px] text-ink">Create one to start uploading photographs.</p>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {initialCollections.map((collection) => {
            const coverId = coverPhotoIds[collection.id];
            const count = photoCounts[collection.id] ?? 0;
            return (
              <li key={collection.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/gallery/${collection.id}`)}
                  className="group flex w-full flex-col border border-stone bg-white text-left transition-colors hover:border-ink"
                >
                  {/* Cover photograph fills the top of the card — the single
                      biggest visual gap the owner called out: this view used
                      to show name/count/date with no image at all. */}
                  <div className="aspect-[4/3] w-full overflow-hidden border-b border-stone bg-paper">
                    {coverId ? (
                      <PhotoThumb
                        photoId={coverId}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageOff className="h-8 w-8 text-stone" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2 p-4">
                    <div>
                      <h2 className="text-[16px] font-semibold text-ink">{collection.name}</h2>
                      <p className="mt-0.5 text-[12px] text-ink">
                        {count} photo{count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-amber opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
