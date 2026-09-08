'use client';

import { useState } from 'react';
import { Star, Trash2, Check, FolderInput } from 'lucide-react';
import type { Folder, Photo } from '@/lib/gallery/types';
import { PhotoThumb } from './PhotoThumb';
import { PhotoLightbox } from './PhotoLightbox';

// The dense thumbnail grid, each photograph's filename set beneath it —
// reference: PhotoGrid.tsx. Selection drives a delete/move-to-folder bar;
// dragging a tile onto the sidebar's cover box (see CollectionDetail) or
// clicking its star sets the collection cover.
export function PhotoGridPanel({
  photos,
  folders,
  coverPhotoId,
  onChanged,
}: {
  photos: Photo[];
  folders: Folder[];
  coverPhotoId: string | null;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [preview, setPreview] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected((prev) => (prev.size === photos.length ? new Set() : new Set(photos.map((p) => p.id))));
  }

  async function setCover(photo: Photo) {
    setError(null);
    try {
      const response = await fetch('/api/gallery/photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: photo.id, promote: true }),
      });
      if (!response.ok) throw new Error(`Could not set the cover photo (${response.status})`);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} photograph${selected.size === 1 ? '' : 's'}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/gallery/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!response.ok) throw new Error(`Could not delete (${response.status})`);
      setSelected(new Set());
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function moveSelected(folderId: string | null) {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/gallery/photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), folderId }),
      });
      if (!response.ok) throw new Error(`Could not move (${response.status})`);
      setSelected(new Set());
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setShowMoveMenu(false);
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 border border-stone bg-white px-4 py-3 text-[13px] text-ink">
          {error}
        </p>
      )}

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-stone bg-white p-3">
          <div className="flex items-center gap-4">
            <span className="text-[12px] text-ink">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={selectAll}
              className="flex items-center gap-1 text-[12px] uppercase tracking-wide text-ink underline decoration-stone underline-offset-4 hover:decoration-ink"
            >
              <Check className="h-3.5 w-3.5" />
              {selected.size === photos.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoveMenu((v) => !v)}
                disabled={busy}
                className="flex items-center gap-1 text-[12px] uppercase tracking-wide text-ink underline decoration-stone underline-offset-4 hover:decoration-ink disabled:opacity-40"
              >
                <FolderInput className="h-3.5 w-3.5" />
                Move to folder
              </button>
              {showMoveMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] border border-stone bg-white py-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => moveSelected(null)}
                    className="block w-full px-3 py-1.5 text-left text-[12px] text-ink hover:bg-paper"
                  >
                    All Photos (no folder)
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => moveSelected(folder.id)}
                      className="block w-full px-3 py-1.5 text-left text-[12px] text-ink hover:bg-paper"
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={busy}
              className="flex items-center gap-1 text-[12px] uppercase tracking-wide text-red-600 underline decoration-stone underline-offset-4 hover:decoration-red-600 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="border border-dashed border-stone py-20 text-center">
          <p className="text-[14px] text-ink">No photographs here yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {photos.map((photo) => {
            const isSelected = selected.has(photo.id);
            const isCover = coverPhotoId === photo.id;
            return (
              <li key={photo.id}>
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({ id: photo.id }));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="group cursor-pointer"
                  onClick={() => toggleSelect(photo.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setPreview(photo);
                  }}
                >
                  <div
                    className={`relative aspect-square w-full overflow-hidden border-2 transition-colors ${
                      isSelected ? 'border-ink' : 'border-transparent hover:border-stone'
                    }`}
                  >
                    <PhotoThumb photoId={photo.id} alt={photo.filename} className="h-full w-full object-cover" />

                    <div
                      className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center border transition-opacity ${
                        isSelected
                          ? 'border-ink bg-ink opacity-100'
                          : 'border-paper bg-ink/30 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-paper" />}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCover(photo);
                      }}
                      title={isCover ? 'Collection cover' : 'Set as collection cover'}
                      className={`absolute right-1 top-1 transition-opacity ${
                        isCover ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Star
                        className={`h-4 w-4 drop-shadow ${isCover ? 'fill-amber text-amber' : 'text-paper hover:fill-amber hover:text-amber'}`}
                      />
                    </button>
                  </div>
                </div>
                <p className="mt-1 truncate text-center font-mono text-[10px] text-ink" title={photo.filename}>
                  {photo.filename}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {preview && <PhotoLightbox photo={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
