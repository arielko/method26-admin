import { randomBytes } from 'node:crypto';

// 16 bytes from a CSPRNG, hex-encoded: 32 characters, 128 bits. There is no
// login and no email gate on the public gallery, so this string in the URL
// is the entire access control. It must never be derived from a name, a
// sequence, a timestamp, or anything a person could guess or enumerate.
export function newGalleryToken(): string {
  return randomBytes(16).toString('hex');
}
