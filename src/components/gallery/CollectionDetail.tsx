'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  Globe,
  BarChart3,
  Image as ImageIcon,
  FolderPlus,
  MoreVertical,
  Pencil,
  Trash2,
  Sparkle,
} from 'lucide-react';
import type { Collection, Folder, Photo, Gallery } from '@/lib/gallery/types';
import { PhotoThumb } from './PhotoThumb';
import { PhotoUploader } from './PhotoUploader';
import { PhotoGridPanel } from './PhotoGridPanel';
import { PublishPanel } from './PublishPanel';
import { AnalyticsPanel } from './AnalyticsPanel';

type View = 'photos' | 'galleries' | 'analytics';
type SortOption = 'filename-asc' | 'filename-desc' | 'date-asc' | 'date-desc';

const SORT_LABELS: Record<SortOption, string> = {
  'filename-asc': 'Filename A → Z',
  'filename-desc': 'Filename Z → A',
  'date-asc': 'Uploaded: oldest first',
  'date-desc': 'Uploaded: newest first',
};

// Reference: CollectionDetail.tsx. Toolbar (Upload · Sort · Galleries ·
// Analytics), a left column carrying the cover photograph and folder
// navigation, and a dense photo grid as the main surface — this is the
// screen the owner said was "literally missing everything I worked on in
// argento": no cover photo, no uploader, no retouched-folder distinction.
export function CollectionDetail({
  collection,
  folders,
  photos,
  galleries,
  hidden,
}: {
  collection: Collection;
  folders: Folder[];
  photos: Photo[];
  galleries: Gallery[];
  hidden: Record<string, string[]>;
}) {
  const [view, setView] = useState<View>('photos');
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortOption>('filename-asc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderRetouched, setNewFolderRetouched] = useState(false);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const router = useRouter();

  const onChanged = () => router.refresh();

  // There's no cover_photo_id column on collections — the cover is simply
  // whichever photo currently sorts first (listPhotos already orders by
  // sort_order), the same photo "Change Cover" promotes to the front. See
  // promotePhotoToFront in queries.ts.
  const coverPhoto = photos.length > 0 ? photos[0] : null;

  const activeFolder = useMemo(() => folders.find((f) => f.id === activeFolderId), [folders, activeFolderId]);

  const visiblePhotos = useMemo(
    () => (activeFolderId ? photos.filter((p) => p.folder_id === activeFolderId) : photos),
    [photos, activeFolderId]
  );

  const sortedPhotos = useMemo(() => {
    const sorted = [...visiblePhotos];
    switch (sortBy) {
      case 'filename-asc':
        sorted.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
        break;
      case 'filename-desc':
        sorted.sort((a, b) => b.filename.localeCompare(a.filename, undefined, { numeric: true }));
        break;
      case 'date-asc':
        sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
        break;
      case 'date-desc':
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
    }
    return sorted;
  }, [visiblePhotos, sortBy]);

  // Every photo needs a folder_id at creation (see the photos POST route),
  // so the toolbar's Upload button needs an unambiguous target: the active
  // folder if one is selected, or the collection's only folder if it has
  // exactly one. Anything more ambiguous disables the button rather than
  // guessing.
  const uploadFolderId = activeFolderId ?? (folders.length === 1 ? folders[0].id : undefined);

  async function setCoverFromDrop(photoId: string) {
    setError(null);
    try {
      const response = await fetch('/api/gallery/photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: photoId, promote: true }),
      });
      if (!response.ok) throw new Error(`Could not set the cover photo (${response.status})`);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function addFolder(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newFolderName.trim();
    if (trimmed.length === 0) return;
    setError(null);
    try {
      const response = await fetch('/api/gallery/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId: collection.id, name: trimmed, isRetouched: newFolderRetouched }),
      });
      if (!response.ok) throw new Error(`Could not create the folder (${response.status})`);
      setNewFolderName('');
      setNewFolderRetouched(false);
      setIsAddingFolder(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function renameFolder(folderId: string) {
    const trimmed = editFolderName.trim();
    if (trimmed.length === 0) {
      setEditingFolderId(null);
      return;
    }
    setError(null);
    try {
      const response = await fetch('/api/gallery/folders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: folderId, name: trimmed }),
      });
      if (!response.ok) throw new Error(`Could not rename the folder (${response.status})`);
      setEditingFolderId(null);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function deleteFolder(folderId: string) {
    if (!confirm('Delete this folder? Its photographs move to All Photos.')) return;
    setError(null);
    try {
      const response = await fetch('/api/gallery/folders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: folderId }),
      });
      if (!response.ok) throw new Error(`Could not delete the folder (${response.status})`);
      if (activeFolderId === folderId) setActiveFolderId(undefined);
      setFolderMenuId(null);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="border-b border-stone pb-4">
        <Link href="/gallery" className="text-[12px] uppercase tracking-wide text-ink">
          ← Galleries
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold text-ink">{collection.name}</h1>
            <p className="mt-1 text-[13px] text-ink">
              {photos.length} photograph{photos.length === 1 ? '' : 's'} · {folders.length} folder
              {folders.length === 1 ? '' : 's'} · {galleries.length} gallery link{galleries.length === 1 ? '' : 's'}
            </p>
          </div>

          {/* Toolbar: Upload · Sort · Galleries · Analytics */}
          <div className="flex flex-wrap items-center gap-2">
            {view === 'photos' && (
              <>
                <PhotoUploader collectionId={collection.id} folderId={uploadFolderId} onDone={onChanged} />

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSortMenu((v) => !v)}
                    className="flex items-center gap-1.5 border border-stone px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-ink hover:border-ink transition-colors"
                  >
                    Sort
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {showSortMenu && (
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[220px] border border-stone bg-white py-1 shadow-sm">
                      {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setSortBy(key);
                            setShowSortMenu(false);
                          }}
                          className={`block w-full px-3 py-1.5 text-left text-[12px] transition-colors ${
                            sortBy === key ? 'bg-ink text-paper' : 'text-ink hover:bg-paper'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setView(view === 'galleries' ? 'photos' : 'galleries')}
              aria-current={view === 'galleries' ? 'true' : undefined}
              className={`flex items-center gap-1.5 border px-3 py-2 text-[11px] font-medium uppercase tracking-wide transition-colors ${
                view === 'galleries' ? 'border-ink bg-ink text-paper' : 'border-stone text-ink hover:border-ink'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              Galleries
            </button>
            <button
              type="button"
              onClick={() => setView(view === 'analytics' ? 'photos' : 'analytics')}
              aria-current={view === 'analytics' ? 'true' : undefined}
              className={`flex items-center gap-1.5 border px-3 py-2 text-[11px] font-medium uppercase tracking-wide transition-colors ${
                view === 'analytics' ? 'border-ink bg-ink text-paper' : 'border-stone text-ink hover:border-ink'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 border border-stone bg-white px-4 py-3 text-[13px] text-ink">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-8">
        {view === 'photos' && (
          <div className="flex w-full flex-shrink-0 flex-col gap-3 md:w-48">
            {/* Cover photograph */}
            <div
              className={`group relative aspect-square w-full overflow-hidden border-2 border-dashed bg-white transition-colors ${
                isDraggingCover ? 'border-ink bg-paper' : 'border-stone'
              }`}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/json')) {
                  e.preventDefault();
                  setIsDraggingCover(true);
                }
              }}
              onDragLeave={() => setIsDraggingCover(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingCover(false);
                const raw = e.dataTransfer.getData('application/json');
                if (!raw) return;
                try {
                  const { id } = JSON.parse(raw) as { id: string };
                  if (id) setCoverFromDrop(id);
                } catch {
                  /* ignore malformed payload */
                }
              }}
            >
              {coverPhoto ? (
                <>
                  <PhotoThumb photoId={coverPhoto.id} alt={collection.name} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-ink/0 transition-colors group-hover:bg-ink/50">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-paper opacity-0 transition-opacity group-hover:opacity-100">
                      Change Cover
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center">
                  <ImageIcon className="h-6 w-6 text-stone" aria-hidden />
                  <span className="text-[10px] uppercase tracking-wider text-ink">Upload photos to set a cover</span>
                </div>
              )}
            </div>
            <p className="text-center text-[10px] uppercase tracking-wider text-ink">Cover Photo</p>

            {/* Folder navigation */}
            <div className="mt-1 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setActiveFolderId(undefined)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors ${
                  !activeFolderId ? 'bg-ink text-paper' : 'text-ink hover:bg-stone'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">All Photos</span>
                <span className={`font-mono text-[10px] ${!activeFolderId ? 'text-paper' : 'text-ink'}`}>
                  {photos.length}
                </span>
              </button>

              {folders.map((folder) => {
                const isActive = activeFolderId === folder.id;
                const count = photos.filter((p) => p.folder_id === folder.id).length;
                return (
                  <div key={folder.id} className="relative">
                    {editingFolderId === folder.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          renameFolder(folder.id);
                        }}
                        className="px-1"
                      >
                        <input
                          autoFocus
                          value={editFolderName}
                          onChange={(e) => setEditFolderName(e.target.value)}
                          onBlur={() => renameFolder(folder.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingFolderId(null);
                          }}
                          className="w-full border border-stone bg-white px-2 py-1 text-[12px] text-ink outline-none"
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveFolderId(folder.id)}
                        className={`group flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors ${
                          isActive ? 'bg-ink text-paper' : 'text-ink hover:bg-stone'
                        }`}
                      >
                        {folder.is_retouched && (
                          // An SVG mark, not a coloured text glyph: amber is
                          // 2.84:1 on paper and is never used as text colour
                          // anywhere in this app, including a Unicode
                          // character rendered via `color`. fill-amber on a
                          // vector shape is the compliant equivalent of the
                          // reference's ✦.
                          <Sparkle aria-hidden className="h-3 w-3 shrink-0 fill-amber text-amber" />
                        )}
                        <span className="flex-1 truncate">
                          {folder.name}
                          {folder.is_retouched && (
                            <span className={`ml-1.5 text-[10px] uppercase tracking-wide ${isActive ? 'text-paper/70' : 'text-ink/60'}`}>
                              Retouched
                            </span>
                          )}
                        </span>
                        <span className={`font-mono text-[10px] ${isActive ? 'text-paper' : 'text-ink'}`}>{count}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFolderMenuId(folderMenuId === folder.id ? null : folder.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              setFolderMenuId(folderMenuId === folder.id ? null : folder.id);
                            }
                          }}
                          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    )}

                    {folderMenuId === folder.id && (
                      <div className="absolute left-full top-0 z-20 ml-1 min-w-[130px] border border-stone bg-white py-1 shadow-sm">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFolderId(folder.id);
                            setEditFolderName(folder.name);
                            setFolderMenuId(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink hover:bg-paper"
                        >
                          <Pencil className="h-3 w-3" /> Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFolder(folder.id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-red-600 hover:bg-paper"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {isAddingFolder ? (
                <form onSubmit={addFolder} className="flex flex-col gap-1.5 px-1 pt-1">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsAddingFolder(false);
                        setNewFolderName('');
                      }
                    }}
                    placeholder="Folder name"
                    className="w-full border border-stone bg-white px-2 py-1 text-[12px] text-ink outline-none"
                  />
                  <label className="flex items-center gap-2 text-[11px] text-ink">
                    <input
                      type="checkbox"
                      checked={newFolderRetouched}
                      onChange={(e) => setNewFolderRetouched(e.target.checked)}
                    />
                    Retouched — goes to the client&rsquo;s delivery page
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="bg-ink px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-paper"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingFolder(false);
                        setNewFolderName('');
                      }}
                      className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingFolder(true)}
                  className="mt-1 flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-ink hover:bg-stone transition-colors"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Add Folder
                </button>
              )}
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {view === 'photos' && (
            <>
              {activeFolder && (
                <p className="mb-3 text-[12px] text-ink">
                  {activeFolder.is_retouched
                    ? 'Retouched — delivered on the client’s downloadable delivery page.'
                    : 'Proofing — the client picks favourites here; nothing downloads from this folder.'}
                </p>
              )}
              <PhotoGridPanel
                photos={sortedPhotos}
                folders={folders}
                coverPhotoId={coverPhoto?.id ?? null}
                onChanged={onChanged}
              />
            </>
          )}

          {view === 'galleries' && (
            <PublishPanel
              collectionId={collection.id}
              galleries={galleries}
              folders={folders}
              photos={photos}
              hidden={hidden}
              onChanged={onChanged}
            />
          )}

          {view === 'analytics' && <AnalyticsPanel photos={photos} galleries={galleries} />}
        </div>
      </div>
    </div>
  );
}
