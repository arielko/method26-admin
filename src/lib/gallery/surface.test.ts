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
  assert.deepEqual(routes, ['api', 'gallery', 'login']);
});

test('no stripped module survives anywhere in the tree', () => {
  for (const gone of ['src/app/crm', 'src/app/social', 'src/app/brand', 'src/app/content',
                      'src/lib/crm', 'src/lib/social', 'src/lib/brand',
                      'src/app/api/crm', 'src/app/api/social', 'src/app/api/webhooks']) {
    assert.equal(existsSync(gone), false, `${gone} must be deleted`);
  }
});

test('every remaining API route authenticates itself', () => {
  // middleware.ts exempts /api entirely. There is no upstream check, so a
  // route without this import is reachable by anyone on the internet.
  const unprotected: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') {
        const source = readFileSync(full, 'utf8');
        if (!source.includes('@/lib/api/auth')) unprotected.push(full);
      }
    }
  }
  if (existsSync('src/app/api')) walk('src/app/api');
  assert.deepEqual(unprotected, [], `unauthenticated routes: ${unprotected.join(', ')}`);
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
                       'src/app/api/gallery/galleries/[id]/route.ts']) {
    assert.equal(existsSync(route), true, `${route} must exist`);
    const source = readFileSync(route, 'utf8');
    assert.ok(source.includes('authenticateSession'), `${route} must authenticate`);
  }
});

test('a gallery token is never taken from the request', () => {
  // The token is the entire access control on the public site. Accepting
  // one from a caller would let somebody pick a short or guessable value.
  const source = readFileSync('src/app/api/gallery/galleries/route.ts', 'utf8');
  assert.ok(!/body\.token|body\[['"]token['"]\]/.test(source),
    'the route must not read a token from the request body');
});
