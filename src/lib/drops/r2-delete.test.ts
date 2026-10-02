import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { deleteObject } from './r2.ts';

const realFetch = globalThis.fetch;
const env = {
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'AKID',
  R2_SECRET_ACCESS_KEY: 'SECRET',
  R2_BUCKET: 'method26-transfers',
};
let calls: { url: string; method?: string }[] = [];

beforeEach(() => {
  Object.assign(process.env, env);
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(status: number) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response(null, { status });
  }) as typeof fetch;
}

test('sends a signed DELETE for the object key', async () => {
  stubFetch(204);
  await deleteObject('drops/abc/def.jpg');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'DELETE');
  const url = new URL(calls[0].url);
  assert.equal(url.host, 'acct.r2.cloudflarestorage.com');
  assert.equal(url.pathname, '/method26-transfers/drops/abc/def.jpg');
  assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/);
});

test('a file that is already gone is not an error', async () => {
  // Makes a half-finished purge safe to run again.
  stubFetch(404);
  await assert.doesNotReject(() => deleteObject('drops/abc/gone.jpg'));
});

test('any other failure is thrown so the row survives for a retry', async () => {
  stubFetch(403);
  await assert.rejects(() => deleteObject('drops/abc/x.jpg'), /403/);
});
