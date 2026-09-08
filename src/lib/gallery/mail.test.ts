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
  // Multipart: the branded template plus a plain-text alternative. Both are
  // required — a message with no text part is markedly more likely to be
  // filed as spam.
  assert.ok(typeof body.text === 'string' && body.text.length > 0, 'text part must be present');
  assert.ok(typeof body.html === 'string' && body.html.includes('<!DOCTYPE html>'), 'html part must be present');

  delete process.env.RESEND_API_KEY;
  delete process.env.GALLERY_EMAIL_FROM;
});

test('the body is plain text: the gallery link, and one line naming it as the credential', () => {
  return import('./mail.ts').then(async ({ sendGalleryEmail }) => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.GALLERY_EMAIL_FROM = 'studio@method26.com';
    let text = '';
    let html = '';
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse((init?.body as string) ?? '{}');
      text = sent.text;
      html = sent.html;
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    }) as typeof fetch;
    await sendGalleryEmail(INPUT, fetchImpl);

    // Both parts, always. A message with no text alternative is markedly more
    // likely to be filed as spam, and the text part is what a screen reader
    // and a watch notification actually read.
    assert.ok(text.includes(INPUT.url), 'text part must include the gallery link');
    assert.ok(html.includes(INPUT.url), 'html part must include the gallery link');
    assert.ok(/credential/i.test(text), 'text part must say the link is the credential');
    assert.ok(/credential/i.test(html), 'html part must say the link is the credential');

    // The text alternative stays plain — that is the point of having one.
    assert.ok(!/<[a-z]/i.test(text), 'text part must carry no markup');

    // This mail carries a credential. A request to somebody else's server on
    // open reveals when it was opened and from where, so the only remote
    // images permitted are the studio's own and the gallery's cover.
    const remote = [...html.matchAll(/(?:src|background)=\"(https?:[^\"]+)\"/gi)].map((m) => m[1]);
    for (const url of remote) {
      assert.ok(
        /^https:\/\/method26\.|^https:\/\/method26-admin\.|backblazeb2\.com/.test(url),
        `html must not load a third-party asset: ${url}`
      );
    }
    assert.ok(!/tracking|pixel|open\.gif|1x1/i.test(html), 'html must carry no tracking pixel');
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

  const EXPIRY = /available until/i;
  assert.ok(!EXPIRY.test(await bodyTextFor(undefined)), 'no expiry line when there is no expiry');
  assert.ok(!EXPIRY.test(await bodyTextFor(null)), 'no expiry line when expiry is null');
  assert.ok(EXPIRY.test(await bodyTextFor('2026-12-25T00:00:00.000Z')), 'expiry line when the gallery has one');

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
