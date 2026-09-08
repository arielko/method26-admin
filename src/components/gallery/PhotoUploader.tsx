'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { uploadPhotos, type UploadProgress, type UploadResult } from '@/lib/gallery/upload';

// The toolbar's UPLOAD control (reference: GalleriesTab/CollectionDetail's
// "Upload" button + hidden file input). Restyled into a compact trigger
// rather than the old always-visible <input type=file> box — the upload
// logic itself (uploadPhotos, its progress callback, retry-by-error) is
// untouched.
export function PhotoUploader({
  collectionId,
  folderId,
  onDone,
}: {
  collectionId: string;
  // Undefined when the toolbar has nothing unambiguous to upload into yet
  // (no folders, or more than one and none selected) — the button disables
  // itself rather than guessing which folder a photo should land in.
  folderId: string | undefined;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
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
    if (!fileList || fileList.length === 0 || !folderId) return;
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
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={!folderId || progress !== null}
        title={
          !folderId
            ? 'Select (or add) a folder to upload into'
            : progress !== null
              ? 'Uploading…'
              : undefined
        }
        className="flex items-center gap-1.5 border border-stone px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-ink hover:border-ink transition-colors disabled:opacity-40 disabled:hover:border-stone"
      >
        <Upload className="h-3.5 w-3.5" aria-hidden />
        Upload
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        disabled={!folderId || progress !== null}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
        className="hidden"
      />

      {progress && (
        <p role="status" className="text-[11px] text-ink">
          {progress.done} of {progress.total} — {progress.filename}
        </p>
      )}
      {error && (
        <p role="alert" className="max-w-xs border border-stone bg-white px-3 py-2 text-[12px] text-ink">
          {error}
        </p>
      )}
      {failures.length > 0 && (
        <div role="alert" className="max-w-xs border border-stone bg-white px-3 py-2 text-[12px] text-ink">
          <div className="flex items-center justify-between gap-2">
            <p>
              {failures.length} file{failures.length === 1 ? '' : 's'} could not be uploaded:
            </p>
            <button type="button" onClick={() => setFailures([])} aria-label="Dismiss">
              <X className="h-3 w-3" />
            </button>
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
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
