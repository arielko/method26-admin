'use client';

// Thin wrapper around the image route. The route itself does the real work
// (auth check, key lookup, signed redirect) — this just keeps every grid in
// the admin requesting the same shape of <img>.
export function PhotoThumb({
  photoId,
  alt,
  variant = 'thumb',
  className,
  onClick,
}: {
  photoId: string;
  alt: string;
  variant?: 'thumb' | 'preview';
  className?: string;
  onClick?: () => void;
}) {
  return (
    <img
      src={`/api/gallery/image/${photoId}?v=${variant}`}
      alt={alt}
      loading="lazy"
      onClick={onClick}
      className={className}
    />
  );
}
