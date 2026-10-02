import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The route imports through the `@/` alias, which Node's test runner cannot
// resolve, so these are structural checks — the same style as the multipart
// route's tests.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const purge = stripComments(readFileSync('src/app/api/drops/purge/route.ts', 'utf8'));
const drops = stripComments(readFileSync('src/app/api/drops/route.ts', 'utf8'));

test('the purge route is guarded by the machine secret before it touches anything', () => {
  const guard = purge.indexOf('authenticateMachine(request)');
  const work = purge.indexOf('purgeExpired(');
  assert.ok(guard !== -1 && work !== -1, 'both must be present');
  assert.ok(guard < work, 'the guard runs first');
  assert.match(purge, /if \(!auth\.ok\) return NextResponse\.json/);
});

test('the purge route reports failures with a non-200 so the keepalive logs them', () => {
  assert.match(purge, /status: result\.failed\.length === 0 \? 200 : 500/);
});

test('the trash button deletes the files, not just the row', () => {
  // The defect this replaces: deleteDrop removed only the database row and the
  // bytes sat in the bucket until the 90-day lifecycle rule.
  assert.match(drops, /purgeDrop\(\{ deleteObject, deleteRow: deleteDrop \}/);
  assert.match(drops, /listDropFiles\(id\)/);
  assert.ok(!/^\s*await deleteDrop\(id\);/m.test(drops), 'no bare row-only delete remains');
});

test('a failed storage delete keeps the transfer and says so', () => {
  assert.match(drops, /status: 502/);
});
