'use client';

import type { Photo } from '@/lib/gallery/types';
import { PhotoThumb } from './PhotoThumb';

export function PhotoLightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={photo.filename}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 border border-paper px-3 py-1.5 text-[12px] uppercase tracking-wide text-paper"
      >
        Close
      </button>
      <PhotoThumb
        photoId={photo.id}
        alt={photo.filename}
        variant="preview"
        className="max-h-[85vh] max-w-[90vw] object-contain"
      />
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[12px] text-paper">{photo.filename}</p>
    </div>
  );
}
