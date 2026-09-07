import imageCompression from 'browser-image-compression';

const THUMBNAIL_WIDTH = 600;
const PREVIEW_WIDTH = 2048;

// The storage layout the whole system depends on. The public site never
// parses these — it stores and signs them verbatim — but keeping them
// predictable makes an object findable from a row and vice versa.
export function objectKeys(collectionId: string, photoId: string, extension: string) {
  for (const part of [collectionId, photoId, extension]) {
    if (part.includes('..') || part.includes('/')) {
      throw new Error(`invalid key component: ${JSON.stringify(part)}`);
    }
  }
  const prefix = `${collectionId}/${photoId}`;
  return {
    thumbnail_key: `${prefix}/thumb.jpg`,
    preview_key: `${prefix}/preview.jpg`,
    original_key: `${prefix}/original${extension}`,
  };
}

// Runs in the browser. The original is uploaded untouched — it is the
// client's actual file and the thing they eventually download.
export async function deriveImages(file: File): Promise<{
  thumbnail: Blob;
  preview: Blob;
  width: number;
  height: number;
}> {
  const [thumbnail, preview] = await Promise.all([
    imageCompression(file, { maxWidthOrHeight: THUMBNAIL_WIDTH, fileType: 'image/jpeg', initialQuality: 0.78, useWebWorker: true }),
    imageCompression(file, { maxWidthOrHeight: PREVIEW_WIDTH, fileType: 'image/jpeg', initialQuality: 0.86, useWebWorker: true }),
  ]);

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();

  return { thumbnail, preview, width, height };
}
