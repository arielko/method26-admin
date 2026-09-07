'use client';

import { useState } from 'react';
import { uploadPhotos, type UploadProgress } from '@/lib/gallery/upload';

export function PhotoUploader({
  collectionId,
  folderId,
  onDone,
}: {
  collectionId: string;
  folderId: string;
  onDone: () => void;
}) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    try {
      await uploadPhotos(collectionId, folderId, Array.from(fileList), setProgress);
      onDone();
    } catch (caught) {
      // Surface the real message. "Failed to fetch" here almost always
      // means the bucket has no CORS rule for this origin.
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setProgress(null);
    }
  }

  return (
    <div>
      <label>
        <span>Add photographs</span>
        <input
          type="file"
          multiple
          accept="image/*"
          disabled={progress !== null}
          onChange={(event) => handleFiles(event.target.files)}
        />
      </label>
      {progress && (
        <p role="status">
          {progress.done} of {progress.total} — {progress.filename}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
