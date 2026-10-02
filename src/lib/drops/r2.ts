// SigV4 query signing for Cloudflare R2, covering the whole multipart
// lifecycle. Same approach as src/lib/gallery/b2.ts — no AWS SDK, because a
// signature is a small job to hand a large dependency and Workers expose
// crypto.subtle — but generalised over the HTTP verb and query string, which
// multipart needs and the gallery's two fixed-purpose signers did not.
//
// R2 speaks the S3 API, so this is ordinary SigV4 with region "auto".
//
// Why transfers live on R2 while the gallery stays on B2: B2 gives free
// egress up to three times average stored data. A gallery stores a lot and
// serves a little, so that is generous. A transfer is the inverse — it
// expires, so almost nothing is stored, while several people at a firm each
// download it — and the ratio inverts. R2's free egress is unconditional,
// and the download path reads through a binding, so no signature, no
// cross-vendor request, and no dependency on a partnership one side has
// stopped advertising.

const SERVICE = 's3';
const REGION = 'auto';

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key instanceof ArrayBuffer ? key : (key.buffer as ArrayBuffer),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function sha256Hex(message: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message)));
}

// encodeURIComponent leaves !'()* unescaped; S3 expects RFC 3986.
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

function config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  // Fail closed and name the variable: an unsigned URL 403s at R2 and reads
  // as a broken upload rather than a misconfigured deploy.
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'R2 is not configured: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET are all required'
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/**
 * One presigned URL for one S3 operation.
 *
 * `query` carries whatever the operation needs — `uploads` for a create,
 * `partNumber`+`uploadId` for a part, `uploadId` alone for list/complete/abort.
 * Only `host` is signed: binding content-type into a part's signature would
 * mean the browser had to send exactly the type the server guessed, and a
 * part of a zip has no meaningful type of its own.
 */
export async function presign(
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  key: string,
  query: Record<string, string> = {},
  expiresIn = 3600
): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucket } = config();

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = '/' + [bucket, ...key.split('/')].map(encodeSegment).join('/');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dateStamp = stamp.slice(0, 8);

  const params: Record<string, string> = {
    ...query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${dateStamp}/${REGION}/${SERVICE}/aws4_request`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${encodeSegment(k)}=${encodeSegment(params[k])}`)
    .join('&');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    stamp,
    `${dateStamp}/${REGION}/${SERVICE}/aws4_request`,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmac(new TextEncoder().encode('AWS4' + secretAccessKey), dateStamp);
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, SERVICE);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Parts are signed for four hours, not the usual fifteen minutes.
 *
 * A part is signed at the moment it starts, but the one in flight when a
 * laptop sleeps may not resume for hours. Fifteen minutes would turn every
 * interrupted upload into a re-signing round trip at best and an unresumable
 * one at worst — which is the exact failure this whole change exists to fix.
 */
export const PART_URL_EXPIRY = 4 * 60 * 60;

/**
 * 100 MB, which is what Backblaze recommends and is a sane figure for R2 too:
 * large enough that a 20 GB file is 200 parts rather than the 4,000 a
 * filesize/10,000 rule would produce, small enough that losing one to a
 * dropped connection costs little.
 *
 * S3 bounds: 5 MB minimum for every part but the last, 5 GiB maximum,
 * 10,000 parts maximum. At 100 MB that ceiling is 1 TB, far past anything
 * this studio sends.
 */
export const PART_SIZE = 100 * 1024 * 1024;

/**
 * A single presigned PUT, with content-type bound into the signature.
 *
 * Separate from presign() above because the signed-header set differs: a
 * whole object has a meaningful content type worth binding, so a browser
 * cannot upload something other than what it declared. A multipart PART has
 * no type of its own — it is a slice of bytes — so binding one there would
 * only create a way for the upload to fail.
 */
export async function presignPut(key: string, contentType: string, expiresIn = 3600): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucket } = config();

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = '/' + [bucket, ...key.split('/')].map(encodeSegment).join('/');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dateStamp = stamp.slice(0, 8);

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${dateStamp}/${REGION}/${SERVICE}/aws4_request`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'content-type;host',
  };

  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${encodeSegment(k)}=${encodeSegment(params[k])}`)
    .join('&');

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    `content-type:${contentType}\nhost:${host}\n`,
    'content-type;host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    stamp,
    `${dateStamp}/${REGION}/${SERVICE}/aws4_request`,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmac(new TextEncoder().encode('AWS4' + secretAccessKey), dateStamp);
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, SERVICE);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Deletes one object. A key that is already gone counts as success: S3
 * answers 204 for it, and the purge relies on that to be safely re-runnable
 * after a partial failure. Anything else throws, so the caller keeps the
 * database row that says which keys still need deleting.
 */
export async function deleteObject(key: string): Promise<void> {
  const url = await presign('DELETE', key, {}, 300);
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 delete of ${key} failed: HTTP ${response.status}`);
  }
}
