// AWS SigV4 query signing over Web Crypto, for presigned PUTs. The public
// site implements the GET half of this in its own src/lib/b2.ts; the two
// are deliberately separate because they run in different applications and
// read configuration from different places. No AWS SDK: a signature is a
// small job to hand a large dependency, and Workers expose crypto.subtle.

const SERVICE = 's3';
const EXPIRY_SECONDS = 900;

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

// encodeURIComponent leaves !'()* unescaped; S3 expects RFC 3986. Segments
// are encoded individually so "/" survives as a separator.
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

export async function signedPutUrl(key: string, contentType: string): Promise<string> {
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APP_KEY;
  const bucket = process.env.B2_BUCKET;
  const region = process.env.B2_REGION;

  // Fail closed: an unsigned URL would 403 at B2 and read as a broken
  // upload rather than a misconfigured server.
  if (!keyId || !appKey || !bucket || !region) {
    throw new Error('B2 is not configured: B2_KEY_ID, B2_APP_KEY, B2_BUCKET and B2_REGION are all required');
  }

  const host = `s3.${region}.backblazeb2.com`;
  const canonicalUri = '/' + [bucket, ...key.split('/')].map(encodeSegment).join('/');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dateStamp = stamp.slice(0, 8);

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${keyId}/${dateStamp}/${region}/${SERVICE}/aws4_request`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(EXPIRY_SECONDS),
    // content-type is signed, so a browser that uploads a different type
    // than it asked for is rejected by B2 rather than silently storing a
    // mislabelled object.
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
    `${dateStamp}/${region}/${SERVICE}/aws4_request`,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmac(new TextEncoder().encode('AWS4' + appKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, SERVICE);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
