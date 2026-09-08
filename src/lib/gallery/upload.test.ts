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
  // The per-file catch is the one that RECORDS the failure. Locating it by
  // the first `catch (error)` in the loop broke the moment an inner helper
  // gained a catch of its own, which says nothing about this property.
  const recordIndex = loop.body.indexOf('failed.push(');
  assert.ok(recordIndex !== -1, 'a failed file must be recorded');
  const catchKeyword = loop.body.lastIndexOf('catch (error)', recordIndex);
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
  // All three objects go out through one `send` helper, which retries and
  // then falls back to the proxy — so the property is "three sends, and send
  // retries", not "three literal putWithRetry calls".
  const sends = [...loop.body.matchAll(/await send\('(thumbnail|preview|original)'/g)].map((m) => m[1]);
  assert.deepEqual(sends, ['thumbnail', 'preview', 'original'], 'all three objects must go through send');
  const sendBody = source.slice(source.indexOf('const send = async ('), source.indexOf('let base = DERIVE'));
  assert.match(sendBody, /await putWithRetry\(/, 'send must retry before giving up');
  assert.match(sendBody, /await putViaProxy\(/, 'and then fall back to the same-origin proxy');

  // Matched against the whole signature rather than `\([^)]*`, which stops at
  // the first `)` — the callback parameter's own parens used to end the match
  // early and fail this test for a signature that was perfectly correct.
  const signature = source.slice(
    source.indexOf('async function putWithRetry('),
    source.indexOf('{', source.indexOf('async function putWithRetry('))
  );
  const attemptsMatch = signature.match(/attempts\s*=\s*(\d+)/);
  assert.ok(attemptsMatch, 'putWithRetry must have a default attempt count greater than one');
  assert.ok(Number(attemptsMatch[1]) >= 2, 'a single attempt is not a retry');
});

test('C-1: uploadPhotos reports which files succeeded and which failed', () => {
  assert.match(source, /succeeded:\s*string\[\]/);
  assert.match(source, /failed:\s*\{\s*filename:\s*string;\s*error:\s*string\s*\}\[\]/);
});

// --- The two upload faults reported from the live admin -------------------

// Comments are stripped before these assertions: the code comments explaining
// these bugs quote the very strings the tests forbid, and an explanation
// should be allowed to name what it forbids.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const uploaderSource = stripComments(readFileSync('src/components/gallery/PhotoUploader.tsx', 'utf8'));
const collectionSource = stripComments(readFileSync('src/components/gallery/CollectionDetail.tsx', 'utf8'));
const derivativesSource = stripComments(readFileSync('src/lib/gallery/derivatives.ts', 'utf8'));
const uploadSource = stripComments(source);

test('the uploader takes a File array, never the input\'s live FileList', () => {
  // The shipped bug: the change handler cleared `input.value` immediately
  // after calling handleFiles, and `input.files` is a LIVE list — clearing
  // the input empties it. handleFiles only reached `Array.from(fileList)`
  // after awaiting folder creation, so on a collection with no folder yet
  // (i.e. a brand-new one) it uploaded nothing and reported nothing.
  assert.match(
    uploaderSource,
    /async function handleFiles\(files: File\[\]\)/,
    'handleFiles must take File[], so a live FileList cannot be held across an await'
  );
  assert.ok(
    !/Array\.from\(fileList\)/.test(uploaderSource),
    'nothing may read the live list after an await'
  );
  assert.match(
    uploaderSource,
    /handleFiles\(Array\.from\(event\.target\.files \?\? \[\]\)\)/,
    'the snapshot must be taken in the change handler, before the input is cleared'
  );
});

test('the retouched view never uploads into an ordinary folder', () => {
  // The shipped bug: the Retouched sidebar entry is a filter, not a folder,
  // so it had no id to upload into and fell through to `folders[0]` — the
  // first ordinary folder. Retouched frames landed on the proofing surface,
  // where the client's delivery page would never show them.
  assert.ok(
    !/activeFolderId !== RETOUCHED_FILTER \? activeFolderId : folders\[0\]\?\.id/.test(collectionSource),
    'the retouched filter must not fall back to the first folder'
  );
  const target = collectionSource.slice(
    collectionSource.indexOf('const uploadFolderId'),
    collectionSource.indexOf(';', collectionSource.indexOf('const uploadFolderId'))
  );
  assert.match(
    target,
    /RETOUCHED_FILTER[\s\S]*folders\.find\(\(f\) => f\.is_retouched\)/,
    'the retouched view must resolve to a folder that is actually retouched'
  );
  // The kind still travels with the request — the server picks or creates a
  // folder of that kind — but the client no longer names or creates it.
  assert.match(
    uploaderSource,
    /ensureDefault: true,\s*isRetouched: isRetouchedTarget,/,
    'a folder opened on demand from the retouched view must itself be retouched'
  );
});

test('every derivative the client renders is WebP', () => {
  const fileTypes = [...derivativesSource.matchAll(/fileType:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(fileTypes.length >= 3, 'thumbnail, preview and original all set an explicit type');
  for (const type of fileTypes) {
    assert.equal(type, 'image/webp', 'WebP is 25-35% smaller than JPEG at these sizes');
  }
});

test('a retouched original is uploaded byte-for-byte, never re-encoded', () => {
  // Re-encoding somebody's finished retouch and handing that back as the
  // deliverable is the failure this guards against.
  assert.match(
    derivativesSource,
    /compressOriginal\s*=\s*true/,
    'compression of the stored original must be switchable'
  );
  assert.match(
    derivativesSource,
    /const original = compressOriginal[\s\S]{0,400}: null;/,
    'compressOriginal: false must yield null, meaning "use the caller\'s file"'
  );
  assert.match(
    uploadSource,
    /const originalBlob = original \?\? file;/,
    'a null derivative must upload the photographer\'s own file'
  );
  assert.match(
    uploadSource,
    /const originalContentType = original \? 'image\/webp' : file\.type/,
    'the content type must follow whichever bytes are actually stored'
  );
  assert.match(
    uploadSource,
    /const extension = original\s*\n?\s*\? '\.webp'/,
    'and so must the key extension — a .CR2 name on WebP bytes downloads as something unopenable'
  );
});

test('upload progress is reported per byte, not per file', () => {
  // fetch cannot report upload progress at all. A 40MB retouched file over a
  // domestic uplink is a minute of nothing, and a bar that only moves between
  // files is not a progress bar.
  assert.match(source, /new XMLHttpRequest\(\)/, 'byte progress requires XHR');
  assert.match(source, /xhr\.upload\.onprogress/, 'the upload phase is the part worth reporting');
  assert.match(source, /batchPercent/, 'the batch total keeps the bar moving across a big file');
  assert.match(
    uploaderSource,
    /role="progressbar"[\s\S]{0,200}aria-valuenow=\{progress\.batchPercent\}/,
    'the bar must expose its value to assistive technology'
  );
});

test('the recorded filename follows the stored bytes', () => {
  // The client sees this name in their gallery and their browser saves the
  // download under it. WebP bytes called .jpg is a file some software will
  // refuse to open — the same lie as an object called thumb.jpg holding WebP.
  assert.match(
    uploadSource,
    /const storedFilename = original\s*\n?\s*\? file\.name\.replace\(.*?\) \+ '\.webp'\s*\n?\s*: file\.name;/s,
    'a compressed original is recorded as .webp; a retouched one keeps its own name'
  );
  assert.match(uploadSource, /filename: storedFilename,/, 'and that is what is persisted');
});

test('a repeated upload cannot leave a trail of empty folders', () => {
  // Three uploads a minute apart produced three folders called Photos: the
  // uploader asked for a NEW folder whenever its `folders` prop looked empty,
  // and that prop only refreshes when a batch succeeds. The server decides it
  // now, from the rows that actually exist.
  assert.match(uploaderSource, /ensureDefault: true/, 'the uploader asks for the default folder');
  assert.ok(
    !/name: isRetouchedTarget \? 'Retouched' : 'Photos'/.test(uploaderSource),
    'the client must not be the thing that names and creates it'
  );
  const queries = stripComments(readFileSync('src/lib/gallery/queries.ts', 'utf8'));
  assert.match(queries, /export async function findOrCreateDefaultFolder/);
  assert.match(
    queries,
    /\.eq\('collection_id', collectionId\)\s*\.eq\('is_retouched', isRetouched\)/,
    'it must look for an existing folder of the right kind before creating one'
  );
});

test('a shoot card offers Share and Delete without nesting buttons', () => {
  const view = stripComments(readFileSync('src/components/gallery/CollectionsView.tsx', 'utf8'));
  // A <button> cannot legally contain another button, and nesting them would
  // make every Delete click also open the shoot. The actions are siblings of
  // the card button, positioned over it.
  assert.match(view, /<li key=\{collection\.id\} className="group relative">/);
  assert.match(view, /className="absolute bottom-4 right-4/);
  assert.match(view, /group-hover:opacity-100 group-focus-within:opacity-100/,
    'hover-only would put both actions out of reach of anyone tabbing through');
  assert.match(view, /<Share2 className="h-4 w-4" aria-hidden \/>/);
  assert.match(view, /<Trash2 className="h-4 w-4" aria-hidden \/>/);
  // Icon-only controls still need names.
  assert.match(view, /aria-label=\{`Share \$\{collection\.name\}`\}/);
  assert.match(view, /aria-label=\{`Delete \$\{collection\.name\}`\}/);
});

test('deleting a shoot says what it destroys before it does it', () => {
  const view = stripComments(readFileSync('src/components/gallery/CollectionsView.tsx', 'utf8'));
  assert.match(view, /if \(!confirm\(warning\)\) return;/, 'never delete without confirmation');
  // Folders, photographs and gallery links all cascade — including links
  // already sitting in a client's inbox.
  assert.match(view, /photograph\$\{count === 1 \? '' : 's'\}/);
  assert.match(view, /already sent to clients/);
  assert.match(view, /cannot be undone/);

  const queries = stripComments(readFileSync('src/lib/gallery/queries.ts', 'utf8'));
  assert.match(queries, /export async function deleteCollection/);
});

test('a gallery row shows one panel at a time', () => {
  // Share and Settings were independent state, so opening one while the other
  // was open rendered both stacked under the same row.
  const panel = stripComments(readFileSync('src/components/gallery/PublishPanel.tsx', 'utf8'));
  const openSend = panel.slice(panel.indexOf('setOpenSendId((cur)'), panel.indexOf('aria-expanded={openSendId'));
  const openSettings = panel.slice(panel.indexOf('setOpenSettingsId((cur)'), panel.indexOf('aria-expanded={openSettingsId'));
  assert.match(openSend, /setOpenSettingsId\(null\)/, 'opening Share must close Settings');
  assert.match(openSettings, /setOpenSendId\(null\)/, 'opening Settings must close Share');
});
