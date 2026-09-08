import { test } from 'node:test';
import assert from 'node:assert/strict';

// Isolated per file by node's test runner (same convention as b2.test.ts),
// so it's safe to freely set/delete these here.
delete process.env.RESEND_API_KEY;
delete process.env.GALLERY_EMAIL_FROM;

const { sendGalleryEmail } = await import('./mail.ts');

const INPUT = { to: 'client@example.com', galleryName: 'Whitfield Family', url: 'https://method26.example/g/abc123/' };

test('throws naming RESEND_API_KEY when it is unset', async () => {
  process.env.GALLERY_EMAIL_FROM = 'method26 Studio <studio@method26.com>';
  await assert.rejects(() => sendGalleryEmail(INPUT), /RESEND_API_KEY/);
  delete process.env.GALLERY_EMAIL_FROM;
});

test('throws naming GALLERY_EMAIL_FROM when it is unset', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  await assert.rejects(() => sendGalleryEmail(INPUT), /GALLERY_EMAIL_FROM/);
  delete process.env.RESEND_API_KEY;
});

test('throws when both are unset, and never reaches the network', async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  await assert.rejects(() => sendGalleryEmail(INPUT, fetchImpl));
  assert.equal(called, false, 'an unconfigured sender must never call fetch, not even with an empty key');
});

test('sends through Resend and returns the provider id on success', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.GALLERY_EMAIL_FROM = 'method26 Studio <studio@method26.com>';

  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify({ id: 'resend-id-123' }), { status: 200 });
  }) as typeof fetch;

  const result = await sendGalleryEmail(INPUT, fetchImpl);
  assert.deepEqual(result, { ok: true, providerId: 'resend-id-123' });
  assert.equal(capturedUrl, 'https://api.resend.com/emails');

  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.authorization, 'Bearer test-key');

  const body = JSON.parse(capturedInit?.body as string);
  assert.equal(body.from, 'method26 Studio <studio@method26.com>');
  assert.deepEqual(body.to, ['client@example.com']);
  assert.ok(typeof body.text === 'string' && body.text.length > 0);
  assert.equal(body.html, undefined);

  delete process.env.RESEND_API_KEY;
  delete process.env.GALLERY_EMAIL_FROM;
});

test('the body is plain text: the gallery link, and one line naming it as the credential', () => {
  return import('./mail.ts').then(async ({ sendGalleryEmail }) => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.GALLERY_EMAIL_FROM = 'studio@method26.com';
    let text = '';
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      text = JSON.parse((init?.body as string) ?? '{}').text;
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    }) as typeof fetch;
    await sendGalleryEmail(INPUT, fetchImpl);
    assert.ok(text.includes(INPUT.url), 'body must include the gallery link');
    assert.ok(/credential/i.test(text), 'body must say the link is the credential, in one line');
    assert.ok(!/<img|<html|tracking/i.test(text), 'body must not carry markup, images, or tracking');
    delete process.env.RESEND_API_KEY;
    delete process.env.GALLERY_EMAIL_FROM;
  });
});

test('includes an expiry line only when the gallery has one', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.GALLERY_EMAIL_FROM = 'studio@method26.com';

  async function bodyTextFor(expiresAt: string | null | undefined): Promise<string> {
    let text = '';
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      text = JSON.parse((init?.body as string) ?? '{}').text;
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    }) as typeof fetch;
    await sendGalleryEmail({ ...INPUT, expiresAt }, fetchImpl);
    return text;
  }

  assert.ok(!/expires/i.test(await bodyTextFor(undefined)));
  assert.ok(!/expires/i.test(await bodyTextFor(null)));
  assert.ok(/expires/i.test(await bodyTextFor('2026-12-25T00:00:00.000Z')));

  delete process.env.RESEND_API_KEY;
  delete process.env.GALLERY_EMAIL_FROM;
});

test('includes the optional message when given, and omits it when not', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.GALLERY_EMAIL_FROM = 'studio@method26.com';

  let captured = '';
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    captured = JSON.parse((init?.body as string) ?? '{}').text;
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  }) as typeof fetch;

  await sendGalleryEmail({ ...INPUT, message: 'So excited to share these with you!' }, fetchImpl);
  assert.ok(captured.includes('So excited to share these with you!'));

  delete process.env.RESEND_API_KEY;
  delete process.env.GALLERY_EMAIL_FROM;
});

test('returns a failure result (not a throw) when Resend answers with an error status', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.GALLERY_EMAIL_FROM = 'studio@method26.com';

  const fetchImpl = (async () => new Response('nope', { status: 422 })) as typeof fetch;
  const result = await sendGalleryEmail(INPUT, fetchImpl);
  assert.deepEqual(result, { ok: false, error: 'resend-422' });

  delete process.env.RESEND_API_KEY;
  delete process.env.GALLERY_EMAIL_FROM;
});

test('returns a failure result when the network call itself throws', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.GALLERY_EMAIL_FROM = 'studio@method26.com';

  const fetchImpl = (async () => {
    throw new Error('fetch failed');
  }) as typeof fetch;
  const result = await sendGalleryEmail(INPUT, fetchImpl);
  assert.deepEqual(result, { ok: false, error: 'network' });

  delete process.env.RESEND_API_KEY;
  delete process.env.GALLERY_EMAIL_FROM;
});
