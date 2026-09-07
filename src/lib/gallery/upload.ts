import { deriveImages } from './derivatives';

export type UploadProgress = { filename: string; done: number; total: number };

export type UploadResult = {
  succeeded: string[];
  failed: { filename: string; error: string }[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function put(url: string, body: Blob, contentType: string): Promise<void> {
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body });
  if (!response.ok) {
    // A CORS failure surfaces as a TypeError before this line, not as a
    // status — if uploads fail with "Failed to fetch", the bucket's CORS
    // rule is missing, not the signature.
    throw new Error(`B2 rejected the upload (${response.status})`);
  }
}

// A B2 5xx or a dropped connection on one PUT out of three-per-photo used
// to unwind the whole batch. Retried a few times with backoff before it's
// treated as a real failure; still lets the caller give up on a
// persistently bad file rather than hang forever.
async function putWithRetry(url: string, body: Blob, contentType: string, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await put(url, body, contentType);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function uploadPhotos(
  collectionId: string,
  folderId: string,
  files: File[],
  onProgress: (progress: UploadProgress) => void
): Promise<UploadResult> {
  const succeeded: string[] = [];
  const failed: { filename: string; error: string }[] = [];
  let done = 0;

  for (const file of files) {
    onProgress({ filename: file.name, done, total: files.length });

    // Each photo is fully independent: presign, upload its three objects,
    // persist its row. One bad file — a B2 5xx that outlasts the retries,
    // an expired session, a non-image the browser can't decode — is
    // skipped and reported rather than aborting everything after it. A
    // 300-frame shoot failing at frame 250 should leave 249 usable rows,
    // not zero.
    try {
      const photoId = crypto.randomUUID();
      const extension = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.jpg').toLowerCase();
      const contentType = file.type || 'application/octet-stream';

      const { thumbnail, preview, width, height } = await deriveImages(file);

      const presignResponse = await fetch('/api/gallery/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId, photoId, extension, contentType }),
      });
      if (!presignResponse.ok) {
        throw new Error(`Could not get upload URLs (${presignResponse.status})`);
      }
      const { keys, urls } = (await presignResponse.json()) as {
        keys: { thumbnail_key: string; preview_key: string; original_key: string };
        urls: { thumbnail: string; preview: string; original: string };
      };

      // Sequential, not parallel: the original can be tens of megabytes, and
      // three concurrent large PUTs per photo across a 300-frame shoot
      // saturates an ordinary connection and makes progress meaningless.
      await putWithRetry(urls.thumbnail, thumbnail, 'image/jpeg');
      await putWithRetry(urls.preview, preview, 'image/jpeg');
      await putWithRetry(urls.original, file, contentType);

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
              file_size_bytes: file.size,
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
    onProgress({ filename: file.name, done, total: files.length });
  }

  return { succeeded, failed };
}
