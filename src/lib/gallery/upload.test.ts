import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// uploadPhotos runs in the browser and calls out to browser-only APIs
// (browser-image-compression, createImageBitmap) that don't exist under
// plain Node, so these are structural checks against the source rather
// than a live invocation — the same style surface.test.ts already uses to
// pin down security-relevant code shape.
const source = readFileSync('src/lib/gallery/upload.ts', 'utf8');

function balancedBlock(src: string, openBraceIndex: number): { start: number; end: number; body: string } {
  let depth = 0;
  let i = openBraceIndex;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return { start: openBraceIndex, end: i, body: src.slice(openBraceIndex, i + 1) };
}

function perFileLoop(): { start: number; end: number; body: string } {
  const forIndex = source.indexOf('for (const file of files)');
  assert.ok(forIndex !== -1, 'uploadPhotos must iterate files in a for loop');
  return balancedBlock(source, source.indexOf('{', forIndex));
}

test('C-1: each photo row is saved inside the per-file loop, not batched after it', () => {
  // The original bug: rows accumulated across every file and were POSTed
  // once after the loop. Any throw partway through — a B2 5xx, a dropped
  // connection, an expired session, a non-image file — unwound the whole
  // function and every row already earned was lost, while the objects
  // already PUT to the bucket stayed orphaned.
  const loop = perFileLoop();
  const photosCallCount = (source.match(/fetch\(\s*'\/api\/gallery\/photos'/g) ?? []).length;
  assert.equal(photosCallCount, 1, 'expected exactly one call site that POSTs to /api/gallery/photos');

  const callIndex = source.indexOf("fetch('/api/gallery/photos'");
  assert.ok(
    callIndex > loop.start && callIndex < loop.end,
    'the photo row must be saved inside the per-file loop, immediately after that photo\'s own ' +
      'uploads succeed — saving it after the loop is the exact bug this guards against'
  );
});

test('C-1: a failure on one file does not abort the rest of the batch', () => {
  const loop = perFileLoop();
  const catchKeyword = loop.body.indexOf('catch (error)');
  assert.ok(catchKeyword !== -1, 'the per-file work must be wrapped in a try/catch inside the loop');

  const catchBlock = balancedBlock(loop.body, loop.body.indexOf('{', catchKeyword));
  assert.ok(
    catchBlock.body.includes('failed.push('),
    'a file that fails must be recorded (filename + reason), not silently dropped'
  );
  assert.ok(
    !/\bthrow\b/.test(catchBlock.body),
    'the catch block must not rethrow — a rethrow here unwinds uploadPhotos entirely and aborts ' +
      'every file still queued behind the one that failed'
  );
});

test('C-1: every PUT is retried before a file is treated as failed', () => {
  const loop = perFileLoop();
  const retryCalls = (loop.body.match(/putWithRetry\(/g) ?? []).length;
  assert.equal(retryCalls, 3, 'expected the thumbnail, preview and original PUTs to all go through retry');

  const attemptsMatch = source.match(/async function putWithRetry\([^)]*attempts\s*=\s*(\d+)/);
  assert.ok(attemptsMatch, 'putWithRetry must have a default attempt count greater than one');
  assert.ok(Number(attemptsMatch[1]) >= 2, 'a single attempt is not a retry');
});

test('C-1: uploadPhotos reports which files succeeded and which failed', () => {
  assert.match(source, /succeeded:\s*string\[\]/);
  assert.match(source, /failed:\s*\{\s*filename:\s*string;\s*error:\s*string\s*\}\[\]/);
});
