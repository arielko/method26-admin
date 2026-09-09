// Storage layout for transfers. Pure and side-effect free, like the gallery's
// own keys.ts, because both the presign route (server) and the browser upload
// path need it.
//
// The caller never supplies a key. It is derived from (dropId, fileId,
// extension) exactly as the gallery's is, so a signed PUT can only ever
// address a path this function would mint — a session cannot be used to
// overwrite an object already delivered to somebody.

export function dropObjectKey(dropId: string, fileId: string, extension: string): string {
  for (const part of [dropId, fileId, extension]) {
    if (part.includes('..') || part.includes('/')) {
      throw new Error(`invalid key component: ${JSON.stringify(part)}`);
    }
  }
  return `drops/${dropId}/${fileId}${extension}`;
}

// A leading dot and a short alphanumeric tail, or nothing. Files without an
// extension are legitimate here — this is not an image pipeline — so an empty
// string is a valid answer rather than a fallback to something invented.
export function safeExtension(filename: string): string {
  const match = filename.match(/\.[A-Za-z0-9]{1,12}$/);
  return match ? match[0].toLowerCase() : '';
}

const KEY_PATTERN = /^drops\/([^/]+)\/([^/]+)$/;

export function parseDropKey(key: string): { dropId: string; file: string } | null {
  const match = KEY_PATTERN.exec(key);
  return match ? { dropId: match[1], file: match[2] } : null;
}
