import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// uploadDropFiles runs in the browser and calls XMLHttpRequest, crypto and
// localStorage, so these are structural checks against the source — the same
// style src/lib/gallery/upload.test.ts uses for the gallery uploader.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const upload = stripComments(readFileSync('src/lib/drops/upload.ts', 'utf8'));
const route = stripComments(readFileSync('src/app/api/drops/multipart/route.ts', 'utf8'));
const r2 = stripComments(readFileSync('src/lib/drops/r2.ts', 'utf8'));

test('a failed part re-sends that part, not the whole file', () => {
  // The defect this replaces: three retries on a single PUT, each restarting
  // from byte zero. On a two-hour upload that is not a retry, it is doing the
  // whole thing again — and one Wi-Fi handoff cost the entire transfer.
  assert.match(upload, /const slice = file\.slice\(start, Math\.min\(start \+ PART_SIZE, file\.size\)\)/);
  assert.match(upload, /for \(let attempt = 1; attempt <= 3; attempt\+\+\)/);
  // The retry loop is INSIDE the per-part loop.
  const partLoop = upload.slice(upload.indexOf('const partNumber = next++'), upload.indexOf('if (failures.length > 0)'));
  assert.match(partLoop, /attempt <= 3/, 'retries must be scoped to one part');
  assert.ok(!/putWithRetry\(url, file,/.test(upload), 'the whole file is never re-sent');
});

test('an interrupted upload resumes across a page reload', () => {
  // Without persistence this is retry-within-session, which is the case that
  // matters least on a multi-gigabyte upload.
  assert.match(upload, /localStorage\.setItem\(resumeKey/);
  assert.match(upload, /await sign\('list-parts'/, 'ask storage which parts already landed');
  assert.match(upload, /if \(etags\.has\(partNumber\)\) continue;/, 'and skip them');
  // Same name and size but different bytes is a different file.
  assert.match(upload, /parsed\.size === file\.size && parsed\.lastModified === file\.lastModified/);
});

test('resumed bytes count towards progress', () => {
  // Otherwise a resumed upload appears to start from zero, which reads as
  // the resume having failed.
  assert.match(upload, /for \(const number of done\.keys\(\)\) \{\s*uploadedPerPart\.set/);
});

test('parts are signed one at a time, not all up front', () => {
  // A 20 GB upload's last part may begin hours after the first; signatures
  // minted up front would have expired.
  const partLoop = upload.slice(upload.indexOf('const partNumber = next++'), upload.indexOf('if (failures.length > 0)'));
  assert.match(partLoop, /await sign\('sign-part'/, 'signed inside the per-part loop');
  assert.match(r2, /export const PART_URL_EXPIRY = 4 \* 60 \* 60;/, 'and long-lived enough to survive a sleep');
});

test('the part size avoids thousands of signing round trips', () => {
  // A filesize/10,000 rule would make a 20 GB file 4,000 presign requests.
  assert.match(r2, /export const PART_SIZE = 100 \* 1024 \* 1024;/);
  assert.match(upload, /const PART_SIZE = 100 \* 1024 \* 1024;/);
});

test('small files skip multipart entirely', () => {
  // One request instead of four, and nothing to gain from resuming an upload
  // that takes seconds.
  assert.match(upload, /file\.size > SINGLE_PUT_MAX\s*\?\s*await uploadMultipart/);
});

test('no bytes pass through the Worker', () => {
  // Not an optimisation: Cloudflare caps an incoming request body at 100 MB
  // on this plan, so routing a multi-gigabyte upload through a Worker is
  // impossible, not merely slow.
  assert.match(route, /return NextResponse\.json\(\{ key, url: await presign/);
  assert.ok(!/formData\(\)/.test(route), 'the signing route never receives a body of bytes');
});

test('the signing route derives its own key and bounds what it is given', () => {
  // A session must not be able to mint a signature for a path outside the
  // transfer it is uploading to.
  assert.match(route, /key = dropObjectKey\(dropId, fileId, extension\)/);
  assert.ok(!/body\.key/.test(route), 'a key is never taken from the caller');
  // uploadId is interpolated into a signed query.
  assert.match(route, /uploadId\.length > 400 \|\| \/\[\^\\w\.~-\]\/\.test\(uploadId\)/);
  assert.match(route, /partNumber < 1 \|\| partNumber > MAX_PARTS/);
});

test('a complete that returns an error body is not treated as success', () => {
  // S3 can answer CompleteMultipartUpload with 200 and an <Error> payload,
  // so the status alone is not proof the object exists.
  assert.match(upload, /completedBody\.includes\('<Error>'\)/);
});

test('content type is bound for a whole object and not for a part', () => {
  // A whole object has a meaningful type worth binding, so a browser cannot
  // store something other than what it declared. A part is a slice of bytes
  // and has no type of its own — binding one there only creates a way to
  // fail.
  assert.match(r2, /'X-Amz-SignedHeaders': 'content-type;host'/, 'presignPut binds it');
  const generic = r2.slice(r2.indexOf('export async function presign('), r2.indexOf('export const PART_URL_EXPIRY'));
  assert.match(generic, /'X-Amz-SignedHeaders': 'host'/, 'presign does not');
});
