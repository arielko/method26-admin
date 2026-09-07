// The storage layout the whole system depends on. Pure and side-effect
// free — both the presign route (server-only, Cloudflare Workers runtime)
// and the browser upload path need it, so it must never pull in a
// browser-only dependency the way derivatives.ts does with
// browser-image-compression. The public site never parses these — it
// stores and signs them verbatim — but keeping them predictable makes an
// object findable from a row and vice versa.

export type ObjectKeys = {
  thumbnail_key: string;
  preview_key: string;
  original_key: string;
};

export function objectKeys(collectionId: string, photoId: string, extension: string): ObjectKeys {
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

const KEY_PATTERN = /^([^/]+)\/([^/]+)\/(thumb\.jpg|preview\.jpg|original\.[a-z0-9]+)$/i;

// The inverse of objectKeys, used to check a key a caller hands back
// against the layout the server actually minted — see photoKeysMatchLayout.
export function parseObjectKey(key: string): { collectionId: string; photoId: string; name: string } | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  return { collectionId: match[1], photoId: match[2], name: match[3] };
}

// True only if all three keys sit under the given collection, share the
// same photo id, and each names the derivative it claims to be. A photo
// row whose keys don't line up this way is either hand-crafted or was
// built from a mismatched folder/collection pair — both are exactly the
// state that should never reach the photos table.
export function photoKeysMatchLayout(collectionId: string, keys: ObjectKeys): boolean {
  const thumbnail = parseObjectKey(keys.thumbnail_key);
  const preview = parseObjectKey(keys.preview_key);
  const original = parseObjectKey(keys.original_key);
  if (!thumbnail || !preview || !original) return false;
  if (thumbnail.name !== 'thumb.jpg' || preview.name !== 'preview.jpg' || !original.name.startsWith('original.')) {
    return false;
  }
  if (thumbnail.collectionId !== collectionId || preview.collectionId !== collectionId || original.collectionId !== collectionId) {
    return false;
  }
  return thumbnail.photoId === preview.photoId && preview.photoId === original.photoId;
}
