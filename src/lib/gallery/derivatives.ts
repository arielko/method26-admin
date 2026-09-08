import imageCompression from 'browser-image-compression';

const THUMBNAIL_WIDTH = 600;
const PREVIEW_WIDTH = 2048;

// What a proofing "original" becomes. A proofing frame is looked at on a
// screen and never delivered, so storing the camera file behind it buys
// nothing and costs the client's upload time and the studio's storage on
// every frame of every shoot. Retouched frames are the opposite — those are
// the deliverable, and go up untouched (see compressOriginal below).
const ORIGINAL_WIDTH = 2560;

// A 45MP frame is roughly 180MB decoded. Two compressions plus a full
// decode for dimensions used to keep three such decodes live in memory at
// once; this cap, together with the sequencing and dimension source below,
// is what keeps a large batch from crashing the tab. Anything past this is
// almost certainly not a photograph for the proofing gallery anyway.
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export type Derivatives = {
  thumbnail: Blob;
  preview: Blob;
  /** null means "upload the caller's file unchanged" — see compressOriginal. */
  original: Blob | null;
  width: number;
  height: number;
};

// Runs in the browser.
//
// Everything the client's browser will ever render is WebP: at the sizes and
// quality below it is roughly 25-35% smaller than the equivalent JPEG, which
// on a 300-frame shoot is the difference between a gallery that opens and one
// that crawls. Support is universal in every browser this admin or the client
// gallery runs in.
//
// `compressOriginal: false` uploads the caller's file byte-for-byte. That is
// the retouched path: those files are the deliverable, the client downloads
// them, and re-encoding somebody's finished retouch is not ours to do.
export async function deriveImages(
  file: File,
  { compressOriginal = true }: { compressOriginal?: boolean } = {}
): Promise<Derivatives> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const limitMb = MAX_FILE_SIZE_BYTES / (1024 * 1024);
    throw new Error(`${file.name} is larger than ${limitMb}MB and was skipped`);
  }

  // Sequential, not Promise.all: two full-resolution decodes running
  // concurrently on top of the original File already in memory is the
  // spike that crashes the tab on a large frame. useWebWorker: false
  // because the library's worker path fetches and executes code from a CDN
  // inside the admin origin at upload time — not a trade this admin needs
  // to make for the modest cost of running compression on the main thread.
  const thumbnail = await imageCompression(file, {
    maxWidthOrHeight: THUMBNAIL_WIDTH,
    fileType: 'image/webp',
    initialQuality: 0.78,
    useWebWorker: false,
  });
  const preview = await imageCompression(file, {
    maxWidthOrHeight: PREVIEW_WIDTH,
    fileType: 'image/webp',
    initialQuality: 0.86,
    useWebWorker: false,
  });

  const original = compressOriginal
    ? await imageCompression(file, {
        maxWidthOrHeight: ORIGINAL_WIDTH,
        fileType: 'image/webp',
        initialQuality: 0.9,
        useWebWorker: false,
      })
    : null;

  // Dimensions come from the preview (already downsized to at most
  // PREVIEW_WIDTH on its long edge) rather than a third decode of the
  // original — imageCompression preserves aspect ratio, so the ratio
  // recorded here matches the original even though the absolute values are
  // the preview's.
  const bitmap = await createImageBitmap(preview);
  const { width, height } = bitmap;
  bitmap.close();

  return { thumbnail, preview, original, width, height };
}
