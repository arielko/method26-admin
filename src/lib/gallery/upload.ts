import { objectKeys, deriveImages } from './derivatives';
import type { NewPhoto } from './types';

export type UploadProgress = { filename: string; done: number; total: number };

async function put(url: string, body: Blob, contentType: string): Promise<void> {
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body });
  if (!response.ok) {
    // A CORS failure surfaces as a TypeError before this line, not as a
    // status — if uploads fail with "Failed to fetch", the bucket's CORS
    // rule is missing, not the signature.
    throw new Error(`B2 rejected the upload (${response.status})`);
  }
}

export async function uploadPhotos(
  collectionId: string,
  folderId: string,
  files: File[],
  onProgress: (progress: UploadProgress) => void
): Promise<number> {
  const rows: NewPhoto[] = [];
  let done = 0;

  for (const file of files) {
    onProgress({ filename: file.name, done, total: files.length });

    const photoId = crypto.randomUUID();
    const extension = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.jpg').toLowerCase();
    const keys = objectKeys(collectionId, photoId, extension);
    const { thumbnail, preview, width, height } = await deriveImages(file);

    const response = await fetch('/api/gallery/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objects: [
          { key: keys.thumbnail_key, contentType: 'image/jpeg' },
          { key: keys.preview_key, contentType: 'image/jpeg' },
          { key: keys.original_key, contentType: file.type || 'application/octet-stream' },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Could not get upload URLs (${response.status})`);
    const { urls } = (await response.json()) as { urls: string[] };

    // Sequential, not parallel: the original can be tens of megabytes, and
    // three concurrent large PUTs per photo across a 300-frame shoot
    // saturates an ordinary connection and makes progress meaningless.
    await put(urls[0], thumbnail, 'image/jpeg');
    await put(urls[1], preview, 'image/jpeg');
    await put(urls[2], file, file.type || 'application/octet-stream');

    rows.push({
      collection_id: collectionId,
      folder_id: folderId,
      filename: file.name,
      ...keys,
      file_size_bytes: file.size,
      width,
      height,
      sort_order: rows.length,
    });

    done += 1;
    onProgress({ filename: file.name, done, total: files.length });
  }

  // Rows are written only after every object is in the bucket. A row whose
  // object is missing renders as a broken image on a client's gallery; an
  // object with no row is invisible and merely wastes storage. Of the two
  // failure modes, the second is the one to prefer.
  const saved = await fetch('/api/gallery/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photos: rows }),
  });
  if (!saved.ok) throw new Error(`Uploaded, but could not save rows (${saved.status})`);

  return rows.length;
}
