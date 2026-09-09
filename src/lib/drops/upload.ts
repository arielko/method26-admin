// Browser-side upload for a transfer.
//
// Deliberately NOT the gallery's uploader. That one derives a thumbnail and a
// preview from every file, which is meaningless for a zip and impossible for a
// PDF. A transfer stores exactly the bytes it was given, under exactly the
// name it was given.
//
// No size cap either. The gallery caps at 100MB because it decodes every frame
// in the tab; nothing here decodes anything, so the limit is B2's own
// single-PUT ceiling of 5GB.

export type DropUploadProgress = {
  filename: string;
  done: number;
  total: number;
  filePercent: number;
  batchPercent: number;
};

export type DropUploadResult = {
  succeeded: { id: string; filename: string; object_key: string; content_type: string; file_size_bytes: number }[];
  failed: { filename: string; error: string }[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// XHR, not fetch: fetch cannot report upload progress, and a multi-gigabyte
// transfer with no progress is indistinguishable from a hung one.
function put(url: string, body: Blob, contentType: string, onProgress: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (${xhr.status})`));
    xhr.onerror = () => reject(new Error('The browser could not complete the upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(body);
  });
}

async function putWithRetry(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (f: number) => void,
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

function extensionOf(filename: string): string {
  const match = filename.match(/\.[A-Za-z0-9]{1,12}$/);
  return match ? match[0].toLowerCase() : '';
}

export async function uploadDropFiles(
  dropId: string,
  files: File[],
  onProgress: (progress: DropUploadProgress) => void
): Promise<DropUploadResult> {
  const succeeded: DropUploadResult['succeeded'] = [];
  const failed: DropUploadResult['failed'] = [];
  let done = 0;

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
    try {
      const fileId = crypto.randomUUID();
      const extension = extensionOf(file.name);
      // A browser that cannot identify the type leaves file.type empty; the
      // recipient's browser then decides from the filename, which is the same
      // thing it would do for any download.
      const contentType = file.type || 'application/octet-stream';

      const presign = await fetch('/api/drops/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dropId, fileId, extension, contentType }),
      });
      if (!presign.ok) {
        const detail = await presign.json().then((d: { error?: string }) => d.error).catch(() => null);
        throw new Error(detail || `Could not get an upload URL (${presign.status})`);
      }
      const { key, url } = (await presign.json()) as { key: string; url: string };

      await putWithRetry(url, file, contentType, (f) => report(file.name, f * 100));

      // Recorded per file, immediately: a batch that fails at file nine
      // should leave eight downloadable, not nothing.
      const save = await fetch(`/api/drops/${dropId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [
            {
              id: fileId,
              filename: file.name,
              object_key: key,
              content_type: contentType,
              file_size_bytes: file.size,
            },
          ],
        }),
      });
      if (!save.ok) throw new Error(`Uploaded, but could not record the file (${save.status})`);

      succeeded.push({
        id: fileId,
        filename: file.name,
        object_key: key,
        content_type: contentType,
        file_size_bytes: file.size,
      });
    } catch (error) {
      failed.push({ filename: file.name, error: error instanceof Error ? error.message : String(error) });
    }
    done += 1;
    report(file.name, 100);
  }

  return { succeeded, failed };
}
