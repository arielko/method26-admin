'use client';

import { useEffect, useState } from 'react';
import { uploadPhotos, type UploadProgress, type UploadResult } from '@/lib/gallery/upload';

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
  const [failures, setFailures] = useState<UploadResult['failed']>([]);

  useEffect(() => {
    if (progress === null) return;
    // Closing the tab mid-upload silently abandons whatever photo is
    // mid-PUT, leaving the batch incomplete with no indication why.
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [progress]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setFailures([]);
    try {
      const result = await uploadPhotos(collectionId, folderId, Array.from(fileList), setProgress);
      setFailures(result.failed);
      if (result.succeeded.length > 0) onDone();
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
      {failures.length > 0 && (
        <div role="alert">
          <p>
            {failures.length} file{failures.length === 1 ? '' : 's'} could not be uploaded:
          </p>
          <ul>
            {failures.map((failure) => (
              <li key={failure.filename}>
                {failure.filename} — {failure.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
