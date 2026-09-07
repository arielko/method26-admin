'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Folder, Photo } from '@/lib/gallery/types';
import { PhotoUploader } from './PhotoUploader';

export function FolderPanel({
  collectionId,
  folders,
  photos,
}: {
  collectionId: string;
  folders: Folder[];
  photos: Photo[];
}) {
  const [name, setName] = useState('');
  const [isRetouched, setIsRetouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function addFolder(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch('/api/gallery/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectionId, name, isRetouched }),
    });
    if (!response.ok) {
      setError(`Could not create the folder (${response.status})`);
      return;
    }
    setName('');
    router.refresh();
  }

  async function toggleRetouched(folder: Folder) {
    setError(null);
    const response = await fetch('/api/gallery/folders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: folder.id, isRetouched: !folder.is_retouched }),
    });
    if (!response.ok) {
      setError(`Could not move the folder (${response.status})`);
      return;
    }
    router.refresh();
  }

  return (
    <section>
      <form onSubmit={addFolder}>
        <label>
          <span>New folder</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <input type="checkbox" checked={isRetouched} onChange={(e) => setIsRetouched(e.target.checked)} />
          <span>retouched — appears on the client&rsquo;s delivery page, not proofing</span>
        </label>
        <button type="submit" disabled={name.trim().length === 0}>add folder</button>
      </form>

      {error && <p role="alert">{error}</p>}

      {folders.map((folder) => (
        <article key={folder.id}>
          <h2>{folder.name}</h2>
          <p>{folder.is_retouched ? 'delivery — the client downloads these' : 'proofing — the client marks selects here'}</p>
          <button type="button" onClick={() => toggleRetouched(folder)}>
            {folder.is_retouched ? 'move to proofing' : 'mark retouched'}
          </button>
          <PhotoUploader
            collectionId={collectionId}
            folderId={folder.id}
            onDone={() => router.refresh()}
          />
          <p>{photos.filter((p) => p.folder_id === folder.id).length} photograph(s)</p>
        </article>
      ))}
    </section>
  );
}
