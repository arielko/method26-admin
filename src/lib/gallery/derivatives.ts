import imageCompression from 'browser-image-compression';

const THUMBNAIL_WIDTH = 600;
const PREVIEW_WIDTH = 2048;

// A 45MP frame is roughly 180MB decoded. Two compressions plus a full
// decode for dimensions used to keep three such decodes live in memory at
// once; this cap, together with the sequencing and dimension source below,
// is what keeps a large batch from crashing the tab. Anything past this is
// almost certainly not a photograph for the proofing gallery anyway.
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

// Runs in the browser. The original is uploaded untouched — it is the
// client's actual file and the thing they eventually download.
export async function deriveImages(file: File): Promise<{
  thumbnail: Blob;
  preview: Blob;
  width: number;
  height: number;
}> {
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
    fileType: 'image/jpeg',
    initialQuality: 0.78,
    useWebWorker: false,
  });
  const preview = await imageCompression(file, {
    maxWidthOrHeight: PREVIEW_WIDTH,
    fileType: 'image/jpeg',
    initialQuality: 0.86,
    useWebWorker: false,
  });

  // Dimensions come from the preview (already downsized to at most
  // PREVIEW_WIDTH on its long edge) rather than a third decode of the
  // original — imageCompression preserves aspect ratio, so the ratio
  // recorded here matches the original even though the absolute values are
  // the preview's.
  const bitmap = await createImageBitmap(preview);
  const { width, height } = bitmap;
  bitmap.close();

  return { thumbnail, preview, width, height };
}
