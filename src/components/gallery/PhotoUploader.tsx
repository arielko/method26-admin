'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { uploadPhotos, type UploadProgress, type UploadResult } from '@/lib/gallery/upload';

export function PhotoUploader({
  collectionId,
  folderId,
  isRetouchedTarget = false,
  onDone,
}: {
  collectionId: string;
  // Undefined when the toolbar has no folder actively selected (the "All
  // Photos" view, or a brand-new collection with none yet). Upload is never
  // disabled for this — see handleFiles, which creates the right folder on
  // demand rather than blocking the control on a choice the photographer
  // hasn't made yet.
  folderId: string | undefined;
  // True when the Retouched view is showing. Decides two things that must
  // agree: which folder a created-on-demand default is (is_retouched), and
  // whether the stored original is a WebP or the photographer's own file.
  isRetouchedTarget?: boolean;
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

  // Takes File[], never the input's FileList.
  //
  // The bug that shipped: the change handler cleared `input.value` right
  // after calling this, and `input.files` is a LIVE list — clearing the input
  // empties it. This function only reached `Array.from(fileList)` after an
  // await (creating the default folder), by which point the list was empty.
  // So it uploaded nothing, reported nothing, and failed silently — but only
  // on a collection with no folder yet, which is to say only on a brand-new
  // collection. Taking File[] makes that unrepresentable.
  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setFailures([]);
    try {
      // A photograph has to land in some folder. If the current view has
      // none — "All Photos" on a fresh collection, or Retouched before a
      // retouched folder exists — ask the server for the one this view means.
      //
      // ensureDefault, not "create": this component's `folders` prop only
      // refreshes after a batch finishes, so asking for a new folder every
      // time it looked empty left one behind on every retry. Three uploads in
      // one minute produced three folders called Photos.
      let targetFolderId = folderId;
      if (!targetFolderId) {
        const response = await fetch('/api/gallery/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collectionId,
            ensureDefault: true,
            isRetouched: isRetouchedTarget,
          }),
        });
        if (!response.ok) throw new Error(`Could not open a folder to upload into (${response.status})`);
        const { folder } = (await response.json()) as { folder: { id: string } };
        targetFolderId = folder.id;
      }
      const result = await uploadPhotos(collectionId, targetFolderId, files, setProgress, {
        // Retouched frames are the deliverable the client downloads. Storing
        // a re-encoded WebP as their "original" would hand back a file that
        // is not the one the retoucher finished.
        compressOriginal: !isRetouchedTarget,
      });
      setFailures(result.failed);
      if (result.succeeded.length > 0) onDone();
    } catch (caught) {
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
        disabled={progress !== null}
        title={progress !== null ? 'Uploading…' : undefined}
        className="flex items-center gap-1.5 border border-stone px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-ink hover:border-ink transition-colors disabled:opacity-40 disabled:hover:border-stone"
      >
        <Upload className="h-3.5 w-3.5" aria-hidden />
        Upload{isRetouchedTarget ? ' retouched' : ''}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        disabled={progress !== null}
        onChange={(event) => {
          // Copied out of the live list before the input is cleared below.
          handleFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
        className="hidden"
      />

      {progress && (
        <div className="w-64 border border-stone bg-white p-2">
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-ink">
            <span className="truncate" title={progress.filename}>
              {progress.filename}
            </span>
            <span className="shrink-0 font-mono">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress.batchPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
            className="mt-1.5 h-1 w-full bg-stone"
          >
            <div
              className="h-full bg-ink transition-[width] duration-150"
              style={{ width: `${progress.batchPercent}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] font-mono text-ink">
            {progress.batchPercent}% · this file {progress.filePercent}%
          </p>
        </div>
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
