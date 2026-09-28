// Browser-side upload for a transfer.
//
// Multipart, not a single PUT. The single-PUT version this replaces had two
// hard ceilings: S3 refuses any one PUT above 5 GB, and its "three retries"
// restarted from byte zero every time — which on a two-hour upload is not a
// retry, it is doing the whole thing again. Laptop sleep, a Wi-Fi handoff or
// one TCP reset cost the entire transfer.
//
// Deliberately hand-rolled rather than pulling in Uppy. Uppy's value is its
// UI and its dozen remote providers; the UI here already exists and there are
// no remote providers. What is actually needed is about 150 lines of part
// bookkeeping, and that is cheaper to own than a dependency whose defaults
// would have to be overridden anyway (its default chunk size would make a
// 20 GB file 4,000 presign round trips).
//
// Nothing here derives thumbnails or previews: a transfer stores exactly the
// bytes it was given under exactly the name it was given.

const PART_SIZE = 100 * 1024 * 1024; // 100 MB — see src/lib/drops/r2.ts
const MAX_CONCURRENT_PARTS = 3;
const SINGLE_PUT_MAX = 100 * 1024 * 1024; // below this, one PUT is simpler and faster

export type DropUploadProgress = {
  filename: string;
  done: number;
  total: number;
  filePercent: number;
  batchPercent: number;
};

export type UploadedFile = {
  id: string;
  filename: string;
  object_key: string;
  content_type: string;
  file_size_bytes: number;
};

export type DropUploadResult = {
  succeeded: UploadedFile[];
  failed: { filename: string; error: string }[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extensionOf(filename: string): string {
  const match = filename.match(/\.[A-Za-z0-9]{1,12}$/);
  return match ? match[0].toLowerCase() : '';
}

/**
 * XHR rather than fetch, for one reason: fetch cannot report upload progress,
 * and a multi-gigabyte transfer with no progress is indistinguishable from a
 * hung one. Returns the part's ETag, which CompleteMultipartUpload needs.
 */
function put(
  url: string,
  body: Blob,
  contentType: string | null,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader('ETag') ?? '');
      } else {
        reject(new Error(`Storage rejected the upload (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('The browser could not complete the upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

async function sign(action: string, params: Record<string, unknown>): Promise<Record<string, string>> {
  const response = await fetch('/api/drops/multipart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  if (!response.ok) {
    const detail = await response.json().then((d: { error?: string }) => d.error).catch(() => null);
    throw new Error(detail || `Could not sign the upload (${response.status})`);
  }
  return response.json();
}

function textOf(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : null;
}

// --- resume bookkeeping ----------------------------------------------------
//
// An uploadId in memory only survives until the tab is closed, which is the
// case that matters least. Persisted, a reload can ask R2 which parts already
// landed and skip them.

type Resumable = { uploadId: string; key: string; fileId: string; size: number; lastModified: number };

function resumeKey(dropId: string, file: File): string {
  return `m26-upload:${dropId}:${file.name}:${file.size}:${file.lastModified}`;
}

function loadResumable(dropId: string, file: File): Resumable | null {
  try {
    const raw = localStorage.getItem(resumeKey(dropId, file));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Resumable;
    // Same name and size but different content is a different file. The
    // lastModified stamp is what catches that.
    return parsed.size === file.size && parsed.lastModified === file.lastModified ? parsed : null;
  } catch {
    return null;
  }
}

function saveResumable(dropId: string, file: File, value: Resumable): void {
  try {
    localStorage.setItem(resumeKey(dropId, file), JSON.stringify(value));
  } catch {
    // Private browsing, or a full quota. Resume is a convenience; the upload
    // still works without it.
  }
}

function clearResumable(dropId: string, file: File): void {
  try {
    localStorage.removeItem(resumeKey(dropId, file));
  } catch {
    /* see saveResumable */
  }
}

/** Parts R2 already holds, so a resumed upload skips them. */
async function alreadyUploaded(listUrl: string): Promise<Map<number, string>> {
  const done = new Map<number, string>();
  const response = await fetch(listUrl);
  if (!response.ok) return done;
  const xml = await response.text();
  for (const block of xml.match(/<Part>[\s\S]*?<\/Part>/g) ?? []) {
    const number = Number(textOf(block, 'PartNumber'));
    const etag = textOf(block, 'ETag');
    if (Number.isInteger(number) && etag) done.set(number, etag);
  }
  return done;
}

async function uploadMultipart(
  dropId: string,
  fileId: string,
  extension: string,
  file: File,
  onBytes: (uploaded: number) => void
): Promise<string> {
  const partCount = Math.ceil(file.size / PART_SIZE);

  let uploadId: string;
  let key: string;
  let done = new Map<number, string>();

  const resumable = loadResumable(dropId, file);
  if (resumable) {
    uploadId = resumable.uploadId;
    key = resumable.key;
    fileId = resumable.fileId;
    const { url } = await sign('list-parts', { dropId, fileId, extension, uploadId });
    done = await alreadyUploaded(url);
  } else {
    const created = await sign('create', { dropId, fileId, extension });
    const response = await fetch(created.url, { method: 'POST' });
    if (!response.ok) throw new Error(`Could not start the upload (${response.status})`);
    const parsed = textOf(await response.text(), 'UploadId');
    if (!parsed) throw new Error('Storage did not return an upload id');
    uploadId = parsed;
    key = created.key;
    saveResumable(dropId, file, { uploadId, key, fileId, size: file.size, lastModified: file.lastModified });
  }

  // Bytes already in R2 count towards progress, or a resumed upload appears
  // to start from zero.
  const etags = new Map(done);
  const uploadedPerPart = new Map<number, number>();
  for (const number of done.keys()) {
    uploadedPerPart.set(number, Math.min(PART_SIZE, file.size - (number - 1) * PART_SIZE));
  }
  const report = () => onBytes([...uploadedPerPart.values()].reduce((a, b) => a + b, 0));
  report();

  // A small worker pool. Three at once saturates a domestic uplink without
  // making progress meaningless or holding four 100 MB slices in memory.
  let next = 1;
  const failures: unknown[] = [];
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_PARTS, partCount) }, async () => {
      for (;;) {
        const partNumber = next++;
        if (partNumber > partCount || failures.length > 0) return;
        if (etags.has(partNumber)) continue;

        const start = (partNumber - 1) * PART_SIZE;
        const slice = file.slice(start, Math.min(start + PART_SIZE, file.size));

        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            // Signed at the moment the part starts, not up front: a 20 GB
            // upload's final part may begin hours after the first.
            const { url } = await sign('sign-part', { dropId, fileId, extension, uploadId, partNumber });
            const etag = await put(url, slice, null, (loaded) => {
              uploadedPerPart.set(partNumber, loaded);
              report();
            });
            etags.set(partNumber, etag);
            uploadedPerPart.set(partNumber, slice.size);
            report();
            lastError = undefined;
            break;
          } catch (error) {
            lastError = error;
            // Only this part is re-sent, not the whole file. That is the
            // entire point of the change.
            uploadedPerPart.set(partNumber, 0);
            if (attempt < 3) await sleep(1000 * 2 ** (attempt - 1));
          }
        }
        if (lastError) failures.push(lastError);
      }
    })
  );

  if (failures.length > 0) {
    throw failures[0] instanceof Error ? failures[0] : new Error(String(failures[0]));
  }

  const xml =
    '<CompleteMultipartUpload>' +
    Array.from({ length: partCount }, (_, i) => i + 1)
      .map((n) => `<Part><PartNumber>${n}</PartNumber><ETag>${etags.get(n)}</ETag></Part>`)
      .join('') +
    '</CompleteMultipartUpload>';

  const { url: completeUrl } = await sign('complete', { dropId, fileId, extension, uploadId });
  const completed = await fetch(completeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
  });
  // S3 can return 200 with an <Error> body on complete, so the status alone
  // is not proof.
  const completedBody = await completed.text();
  if (!completed.ok || completedBody.includes('<Error>')) {
    throw new Error('Storage could not assemble the upload');
  }

  clearResumable(dropId, file);
  return key;
}

async function uploadSingle(
  dropId: string,
  fileId: string,
  extension: string,
  file: File,
  contentType: string,
  onBytes: (uploaded: number) => void
): Promise<string> {
  const { key, url } = await sign('single', { dropId, fileId, extension, contentType });
  await put(url, file, contentType, onBytes);
  return key;
}

export async function uploadDropFiles(
  dropId: string,
  files: File[],
  onProgress: (progress: DropUploadProgress) => void
): Promise<DropUploadResult> {
  const succeeded: UploadedFile[] = [];
  const failed: { filename: string; error: string }[] = [];
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
      const resumable = loadResumable(dropId, file);
      const fileId = resumable?.fileId ?? crypto.randomUUID();
      const extension = extensionOf(file.name);
      // A browser that cannot identify the type leaves file.type empty; the
      // recipient's browser then decides from the filename, exactly as it
      // would for any download.
      const contentType = file.type || 'application/octet-stream';

      const onBytes = (uploaded: number) =>
        report(file.name, file.size > 0 ? (uploaded / file.size) * 100 : 100);

      // Below the threshold a single PUT is one request instead of four and
      // has nothing to gain from resumability.
      const key =
        file.size > SINGLE_PUT_MAX
          ? await uploadMultipart(dropId, fileId, extension, file, onBytes)
          : await uploadSingle(dropId, fileId, extension, file, contentType, onBytes);

      // Recorded per file, immediately: a batch that fails at file nine
      // leaves eight downloadable, not nothing.
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
