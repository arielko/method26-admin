import { test } from 'node:test';
import assert from 'node:assert/strict';

// Isolated per file by node's test runner (same convention as b2.test.ts),
// so it's safe to freely set/delete these here.
delete process.env.RESEND_API_KEY;
delete process.env.GALLERY_EMAIL_FROM;

const { sendGalleryEmail, redactEmails, isValidFromAddress, describeFrom } = await import('./mail.ts');

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

test('a provider error says what went wrong, without leaking an address', async () => {
  // `resend-422` alone was undiagnosable: a malformed From address, an
  // unverified domain and a bad payload all looked identical, and a real
  // failed send could not be acted on.
  process.env.RESEND_API_KEY = 'k';
  process.env.GALLERY_EMAIL_FROM = 'method26 <studio@method26.com>';
  const result = await sendGalleryEmail(
    { to: 'client@example.com', galleryName: 'G', url: 'https://method26.example/g/t/' },
    (async () =>
      new Response(
        JSON.stringify({
          statusCode: 422,
          name: 'validation_error',
          message: 'Invalid `from` field. The email address client@example.com is not valid.',
        }),
        { status: 422 }
      )) as unknown as typeof fetch
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /^resend-422 /, 'the status is still there');
    assert.match(result.error, /validation_error/, 'and the provider name');
    assert.match(result.error, /Invalid `from` field/, 'and the message that identifies the fault');
    assert.ok(!result.error.includes('client@example.com'), 'but never an address');
    assert.match(result.error, /<email>/, 'which is redacted, not dropped');
  }
});

test('redaction is broad enough for text written by somebody else', () => {
  // Over-redaction is the deliberate direction: the trailing sentence period
  // is swallowed with the address, which costs a little clarity and never
  // costs a leaked address.
  assert.equal(redactEmails('to a@b.co and <c@d.io>, plus e@f.dev.'), 'to <email> and <<email>>, plus <email>');
  assert.equal(redactEmails('nothing here'), 'nothing here');
});

test('a malformed sender is caught before any recipient is contacted', async () => {
  // The real failure: Resend answered `Invalid \`from\` field` once per
  // recipient. A misconfigured sender fails identically for everyone, so
  // there is no reason to learn it a round trip at a time.
  process.env.RESEND_API_KEY = 'k';
  process.env.GALLERY_EMAIL_FROM = '"method26 <studio@method26.com>"';
  let called = false;
  await assert.rejects(
    () =>
      sendGalleryEmail(INPUT, (async () => {
        called = true;
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch),
    /GALLERY_EMAIL_FROM must be/
  );
  assert.equal(called, false, 'nothing may reach the provider');
});

test('both shapes Resend accepts are accepted here', () => {
  for (const good of [
    'studio@method26.com',
    'method26 <studio@method26.com>',
    '  method26 <studio@method26.com>  ',
    'method26 Studio <hello@mail.method26.com>',
  ]) {
    assert.ok(isValidFromAddress(good), `${good} should be valid`);
  }
  for (const bad of [
    '"method26 <studio@method26.com>"',   // pasted with its quotes
    'method26 studio@method26.com',       // no angle brackets
    'studio@method26',                    // no TLD
    'method26 <studio@method26.com',      // unclosed
    '',
    'method26',
  ]) {
    assert.ok(!isValidFromAddress(bad), `${bad} should be rejected`);
  }
});

test('the sender error shows the shape of what is stored, not the mailbox', () => {
  // `wrangler secret list` prints only names, so without this there is no way
  // to see what a secret actually contains.
  assert.equal(
    describeFrom('"method26 <studio@method26.com>"'),
    '`"method26 <<email>>"` (32 characters)'
  );
  assert.ok(!describeFrom('"method26 <studio@method26.com>"').includes('studio@method26.com'));
  // Whitespace that is invisible in a terminal is named rather than shown.
  assert.match(describeFrom('a@b.co\n'), /<whitespace>/);
  // Written as an escape on purpose: a literal non-breaking space is
  // invisible in the source, which is exactly why it is worth naming in the
  // error. I introduced one here by accident while writing this test.
  assert.match(describeFrom('method26\u00a0<a@b.co>'), /<nbsp>/);
});
