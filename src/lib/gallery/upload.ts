import { deriveImages } from './derivatives';

export type UploadProgress = {
  filename: string;
  /** Files finished (succeeded or failed) so far. */
  done: number;
  total: number;
  /** 0-100 through the file named above. */
  filePercent: number;
  /** 0-100 across the whole batch, so a progress bar can't stall on a big file. */
  batchPercent: number;
};

export type UploadResult = {
  succeeded: string[];
  failed: { filename: string; error: string }[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// XHR rather than fetch, for one reason: fetch cannot report upload progress.
// A 40MB retouched file over a domestic uplink is a minute of nothing, and a
// progress bar that only moves between files is not a progress bar.
function put(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`B2 rejected the upload (${xhr.status})`));
    };
    // A CORS failure surfaces here with no status, not as an HTTP error — if
    // uploads fail this way, the bucket's CORS rule is missing, not the
    // signature.
    xhr.onerror = () =>
      reject(new Error('Could not reach B2 — check the bucket CORS rule for this origin'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(body);
  });
}

// A B2 5xx or a dropped connection on one PUT out of three-per-photo used
// to unwind the whole batch. Retried a few times with backoff before it's
// treated as a real failure; still lets the caller give up on a
// persistently bad file rather than hang forever.
async function putWithRetry(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
  attempts = 3
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await put(url, body, contentType, onProgress);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export type UploadOptions = {
  /**
   * false uploads each file byte-for-byte instead of storing a WebP as its
   * original. Used for retouched folders: those files are the deliverable.
   */
  compressOriginal?: boolean;
};

export async function uploadPhotos(
  collectionId: string,
  folderId: string,
  files: File[],
  onProgress: (progress: UploadProgress) => void,
  { compressOriginal = true }: UploadOptions = {}
): Promise<UploadResult> {
  const succeeded: string[] = [];
  const failed: { filename: string; error: string }[] = [];
  let done = 0;

  // Weights sum to 1 and are rough on purpose: deriving is CPU-bound and
  // roughly constant per frame, the three PUTs are network-bound and
  // dominated by the original. Being approximately right keeps the bar
  // moving smoothly, which is the entire job.
  const DERIVE = 0.25;
  const THUMB = 0.05;
  const PREVIEW = 0.2;
  const ORIGINAL = 0.5;

  const report = (filename: string, filePercent: number) =>
    onProgress({
      filename,
      done,
      total: files.length,
      filePercent: Math.min(100, Math.round(filePercent)),
      batchPercent: Math.min(100, Math.round(((done + filePercent / 100) / files.length) * 100)),
    });

  for (const file of files) {
    report(file.name, 0);

    // Each photo is fully independent: presign, upload its three objects,
    // persist its row. One bad file — a B2 5xx that outlasts the retries,
    // an expired session, a non-image the browser can't decode — is
    // skipped and reported rather than aborting everything after it. A
    // 300-frame shoot failing at frame 250 should leave 249 usable rows,
    // not zero.
    try {
      const photoId = crypto.randomUUID();

      const { thumbnail, preview, original, width, height } = await deriveImages(file, {
        compressOriginal,
      });
      report(file.name, DERIVE * 100);

      // The stored original is a WebP for proofing and the caller's own file
      // for retouched, so the extension and content type follow whichever it
      // actually is — a .CR2 name on WebP bytes would be served with the
      // wrong type and download as something the client cannot open.
      const originalBlob = original ?? file;
      const originalContentType = original ? 'image/webp' : file.type || 'application/octet-stream';
      const extension = original
        ? '.webp'
        : (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.jpg').toLowerCase();

      const presignResponse = await fetch('/api/gallery/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId, photoId, extension, contentType: originalContentType }),
      });
      if (!presignResponse.ok) {
        const detail = await presignResponse
          .json()
          .then((d: { error?: string }) => d.error)
          .catch(() => null);
        throw new Error(detail || `Could not get upload URLs (${presignResponse.status})`);
      }
      const { keys, urls } = (await presignResponse.json()) as {
        keys: { thumbnail_key: string; preview_key: string; original_key: string };
        urls: { thumbnail: string; preview: string; original: string };
      };

      // Sequential, not parallel: the original can be tens of megabytes, and
      // three concurrent large PUTs per photo across a 300-frame shoot
      // saturates an ordinary connection and makes progress meaningless.
      let base = DERIVE;
      await putWithRetry(urls.thumbnail, thumbnail, 'image/webp', (f) =>
        report(file.name, (base + THUMB * f) * 100)
      );
      base += THUMB;
      await putWithRetry(urls.preview, preview, 'image/webp', (f) =>
        report(file.name, (base + PREVIEW * f) * 100)
      );
      base += PREVIEW;
      await putWithRetry(urls.original, originalBlob, originalContentType, (f) =>
        report(file.name, (base + ORIGINAL * f) * 100)
      );

      // Persisted immediately, not deferred to the end of the batch: an
      // object with no row is invisible and merely wastes storage — the
      // failure mode to prefer over a row whose object is missing — but
      // that only argues for objects-before-row on THIS photo, not for
      // holding every row in memory until the whole batch finishes.
      const saveResponse = await fetch('/api/gallery/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photos: [
            {
              folder_id: folderId,
              filename: file.name,
              ...keys,
              file_size_bytes: originalBlob.size,
              width,
              height,
            },
          ],
        }),
      });
      if (!saveResponse.ok) {
        throw new Error(`Uploaded, but could not save the row (${saveResponse.status})`);
      }

      succeeded.push(file.name);
    } catch (error) {
      failed.push({ filename: file.name, error: error instanceof Error ? error.message : String(error) });
    }

    done += 1;
    report(file.name, 100);
  }

  return { succeeded, failed };
}
