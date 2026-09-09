import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync, readFileSync } from 'node:fs';

// The module surface IS the security surface: middleware exempts /api, so
// every route left in the tree is a route somebody must keep correct.
test('only the gallery module and login remain', () => {
  const routes = readdirSync('src/app', { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  // Pinned as an exact set, not a subset: this guards against a stripped
  // fork module (crm, social, brand, content) reappearing, and a subset
  // check would let one back in silently. Adding a route deliberately means
  // adding it here — 'send' is Send Files, built for this studio, not
  // inherited.
  assert.deepEqual(routes, ['api', 'gallery', 'login', 'send']);
});

test('no stripped module survives anywhere in the tree', () => {
  for (const gone of ['src/app/crm', 'src/app/social', 'src/app/brand', 'src/app/content',
                      'src/lib/crm', 'src/lib/social', 'src/lib/brand',
                      'src/app/api/crm', 'src/app/api/social', 'src/app/api/webhooks']) {
    assert.equal(existsSync(gone), false, `${gone} must be deleted`);
  }
});

test('every remaining API route authenticates itself and enforces the result', () => {
  // middleware.ts exempts /api entirely. There is no upstream check, so a
  // route that doesn't both CALL authenticateSession() and ACT on its
  // result is reachable by anyone on the internet.
  //
  // A prior version of this test only asserted the substring
  // '@/lib/api/auth' appeared somewhere in the file. That passes for a
  // route that imports the helper and never calls it, one whose
  // `if (!auth.authenticated) return unauthorizedResponse(...)` guard was
  // deleted, or one where only a comment mentions auth. This version
  // requires the actual call-and-guard idiom: a variable assigned from
  // `await authenticateSession(...)`, then an `if (!<that variable>.authenticated)`
  // branch that returns `unauthorizedResponse(...)`.
  const unprotected: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/^route\.(ts|tsx|js)$/.test(entry.name)) continue;

      // Strip full-line `//` comments so a guard that was commented out
      // rather than deleted still fails this test — the literal text
      // `if (!auth.authenticated) return unauthorizedResponse(...)` reads
      // identically whether it's live code or a disabled line, so matching
      // against raw source would miss exactly the failure mode this test
      // exists to catch.
      const source = readFileSync(full, 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      const assignment = source.match(/const\s+(\w+)\s*=\s*await\s+authenticateSession\(/);
      const guarded =
        assignment !== null &&
        new RegExp(`if\\s*\\(\\s*!${assignment[1]}\\.authenticated\\s*\\)\\s*return\\s+unauthorizedResponse\\(`).test(
          source
        );
      if (!guarded) unprotected.push(full);
    }
  }
  if (existsSync('src/app/api')) walk('src/app/api');
  assert.deepEqual(unprotected, [], `routes that don't call-and-guard on auth: ${unprotected.join(', ')}`);
});

test('the collections and folders routes authenticate themselves', () => {
  for (const route of ['src/app/api/gallery/collections/route.ts',
                       'src/app/api/gallery/folders/route.ts']) {
    assert.equal(existsSync(route), true, `${route} must exist`);
    const source = readFileSync(route, 'utf8');
    assert.ok(source.includes('authenticateSession'), `${route} must authenticate`);
    assert.ok(source.includes('unauthorizedResponse'), `${route} must reject unauthenticated callers`);
  }
});

test('the galleries routes authenticate themselves', () => {
  for (const route of ['src/app/api/gallery/galleries/route.ts',
                       'src/app/api/gallery/galleries/[id]/route.ts',
                       'src/app/api/gallery/galleries/[id]/send/route.ts',
                       'src/app/api/gallery/galleries/[id]/analytics/route.ts']) {
    assert.equal(existsSync(route), true, `${route} must exist`);
    const source = readFileSync(route, 'utf8');
    assert.ok(source.includes('authenticateSession'), `${route} must authenticate`);
  }
});

test('the send route resolves the gallery from the URL id, not from the request body', () => {
  // A caller-chosen galleryId in the body would let one session send mail
  // "as" any gallery it can name, sidestepping the not-published refusal
  // and the token that route was scoped to.
  const source = readFileSync('src/app/api/gallery/galleries/[id]/send/route.ts', 'utf8');
  assert.ok(!/body\.galleryId|body\[['"]galleryId['"]\]/.test(source),
    'the route must not read a gallery id from the request body');
  assert.ok(source.includes('getGallery(id)'), 'the route must resolve the gallery from the URL param');
});

test('a gallery token is never taken from the request', () => {
  // The token is the entire access control on the public site. Accepting
  // one from a caller would let somebody pick a short or guessable value.
  const source = readFileSync('src/app/api/gallery/galleries/route.ts', 'utf8');
  assert.ok(!/body\.token|body\[['"]token['"]\]/.test(source),
    'the route must not read a token from the request body');
});

test('I-4: the presign route derives the object key itself; a caller-supplied key is never signed', () => {
  // This route used to accept an arbitrary `key` and reject only ".." and
  // a leading "/" — a valid session could mint a signed PUT for ANY key in
  // the bucket, including one already delivered to a client, overwriting
  // the bytes behind a row that would still look valid. The key is now
  // derived server-side from (collectionId, photoId, extension).
  const source = readFileSync('src/app/api/gallery/presign/route.ts', 'utf8');
  assert.ok(
    !/\bobject\.key\b|\bbody\.objects\b/.test(source),
    'the route must not read a raw storage key (or the old objects[] array) from the request body'
  );
  assert.ok(source.includes('objectKeys('), 'the route must derive the key server-side via objectKeys()');
  assert.ok(source.includes('collectionExists('), 'the route must verify the collection actually exists');
});

test('I-5: the photos route derives collection_id from the folder; it is never taken from the request', () => {
  // A folder_id from one collection paired with a caller-supplied
  // collection_id from another used to render in the grid while every
  // tile 404s against the bucket. collection_id now comes only from the
  // folder the photo actually belongs to.
  const source = readFileSync('src/app/api/gallery/photos/route.ts', 'utf8');
  assert.ok(
    !/collection_id:\s*photo\.collection_id|photo\[['"]collection_id['"]\]/.test(source),
    'collection_id must not be read from the request body'
  );
  assert.ok(source.includes('getFolder('), 'the route must look up the folder server-side');
  assert.ok(
    source.includes('photoKeysMatchLayout('),
    'the route must check the submitted keys actually match this collection/photo layout'
  );
});

test('the visibility route authenticates itself', () => {
  const route = 'src/app/api/gallery/visibility/route.ts';
  assert.equal(existsSync(route), true, `${route} must exist`);
  const source = readFileSync(route, 'utf8');
  assert.ok(source.includes('authenticateSession'), `${route} must authenticate`);
});

test('login redirects to a route that exists', () => {
  // src/app/login/page.tsx used to send a successful sign-in to /content, a
  // module deleted on this branch — the test above already guarantees
  // /content doesn't exist, so the redirect was silently broken and the
  // suite still reported green. This checks the redirect target itself
  // resolves to a real page.
  const source = readFileSync('src/app/login/page.tsx', 'utf8');
  const match = source.match(/window\.location\.href\s*=\s*['"`]([^'"`]+)['"`]/);
  assert.ok(match, 'login page must set window.location.href to a route after sign-in');

  const target = match[1].split('?')[0].split('#')[0];
  assert.equal(target.startsWith('/'), true, `redirect target "${target}" must be an app-relative path`);
  assert.equal(
    existsSync(`src/app${target}/page.tsx`),
    true,
    `login redirect target "${target}" must exist as a route (src/app${target}/page.tsx)`
  );
});
