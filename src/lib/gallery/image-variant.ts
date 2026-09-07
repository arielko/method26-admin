// The image route's allowlist for which derivative a caller may request.
// A two-entry map keyed on the validated variant name — never string
// interpolation or index access on caller input — so the only fields this
// can ever address are thumbnail_key and preview_key. original_key has no
// entry here, so no value of `v` can reach it, however this map is called.
// There is no admin use for full-resolution bytes in a grid, and the
// public site's entire design rests on originals being reachable only
// through its own delivery route.
const VARIANT_KEY_FIELD = {
  thumb: 'thumbnail_key',
  preview: 'preview_key',
} as const satisfies Record<string, 'thumbnail_key' | 'preview_key'>;

export type ImageVariant = keyof typeof VARIANT_KEY_FIELD;

export function isImageVariant(value: string | null | undefined): value is ImageVariant {
  return value === 'thumb' || value === 'preview';
}

export function variantKeyField(variant: ImageVariant): 'thumbnail_key' | 'preview_key' {
  return VARIANT_KEY_FIELD[variant];
}
