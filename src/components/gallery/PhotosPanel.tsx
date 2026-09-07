'use client';

import { useState } from 'react';
import type { Folder, Photo } from '@/lib/gallery/types';
import { PhotoUploader } from './PhotoUploader';
import { PhotoThumb } from './PhotoThumb';
import { PhotoLightbox } from './PhotoLightbox';

export function PhotosPanel({
  collectionId,
  folders,
  photos,
  onChanged,
}: {
  collectionId: string;
  folders: Folder[];
  photos: Photo[];
  onChanged: () => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [isRetouched, setIsRetouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Photo | null>(null);

  async function addFolder(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/gallery/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId, name: trimmed, isRetouched }),
      });
      if (!response.ok) throw new Error(`Could not create the folder (${response.status})`);
      setName('');
      setIsRetouched(false);
      setIsAdding(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRetouched(folder: Folder) {
    setError(null);
    try {
      const response = await fetch('/api/gallery/folders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: folder.id, isRetouched: !folder.is_retouched }),
      });
      if (!response.ok) throw new Error(`Could not move the folder (${response.status})`);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p role="alert" className="border border-stone bg-white px-4 py-3 text-[13px] text-ink">
          {error}
        </p>
      )}

      {isAdding ? (
        <form onSubmit={addFolder} className="flex flex-wrap items-end gap-3 border border-stone bg-white p-4">
          <label className="flex flex-1 min-w-[200px] flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink">Folder name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="e.g. Ceremony"
              className="w-full text-[14px]"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-[12px] text-ink">
            <input type="checkbox" checked={isRetouched} onChange={(e) => setIsRetouched(e.target.checked)} />
            <span>Retouched — goes to the client&rsquo;s delivery page, downloadable</span>
          </label>
          <button
            type="submit"
            disabled={busy || name.trim().length === 0}
            className="bg-ink px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-paper disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Add folder'}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAdding(false);
              setName('');
              setIsRetouched(false);
            }}
            className="px-3 py-2 text-[12px] uppercase tracking-wide text-ink"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="self-start border border-ink px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-ink hover:bg-ink hover:text-paper transition-colors"
        >
          + New folder
        </button>
      )}

      {folders.length === 0 ? (
        <div className="border border-dashed border-stone py-16 text-center">
          <p className="text-[14px] text-ink">No folders yet.</p>
          <p className="mt-1 text-[12px] text-ink">Add a folder before uploading — every photograph belongs to one.</p>
        </div>
      ) : (
        folders.map((folder) => {
          const folderPhotos = photos.filter((p) => p.folder_id === folder.id);
          return (
            <section key={folder.id} className="border border-stone bg-white">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone px-4 py-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-[16px] font-semibold text-ink">{folder.name}</h2>
                  <span className="text-[11px] uppercase tracking-wide text-ink">
                    {folderPhotos.length} photograph{folderPhotos.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink">
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 ${folder.is_retouched ? 'bg-amber' : 'bg-stone'}`}
                    />
                    {folder.is_retouched ? 'Retouched — delivery' : 'Proofing — selects'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleRetouched(folder)}
                    className="border border-stone px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink hover:border-ink transition-colors"
                  >
                    {folder.is_retouched ? 'Move to proofing' : 'Mark retouched'}
                  </button>
                </div>
              </header>

              <div className="p-4">
                <PhotoUploader collectionId={collectionId} folderId={folder.id} onDone={onChanged} />

                {folderPhotos.length > 0 && (
                  <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {folderPhotos.map((photo) => (
                      <li key={photo.id}>
                        <button
                          type="button"
                          onClick={() => setPreview(photo)}
                          className="block aspect-square w-full overflow-hidden border border-stone"
                        >
                          <PhotoThumb
                            photoId={photo.id}
                            alt={photo.filename}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        })
      )}

      {preview && <PhotoLightbox photo={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
