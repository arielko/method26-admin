import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendGalleryLink, isValidRecipient } from './send.ts';
import type { Gallery } from './types.ts';

const PUBLISHED: Gallery = {
  id: 'g1',
  collection_id: 'c1',
  token: 'abc123',
  name: 'Whitfield Family',
  is_published: true,
  expiration_date: null,
  cover_photo_id: null,
  downloads_enabled: false,
  email_capture_enabled: true,
};

function deps(sendResult: { ok: true; providerId: string } | { ok: false; error: string }) {
  const recorded: unknown[] = [];
  const sent: unknown[] = [];
  return {
    recorded,
    sent,
    deps: {
      send: async (input: unknown) => {
        sent.push(input);
        return sendResult;
      },
      record: async (row: unknown) => {
        recorded.push(row);
      },
    },
  };
}

test('isValidRecipient accepts a single well-formed address', () => {
  assert.equal(isValidRecipient('client@example.com'), true);
  assert.equal(isValidRecipient('  client@example.com  '), true);
});

test('isValidRecipient rejects more than one recipient joined by comma or semicolon', () => {
  assert.equal(isValidRecipient('a@example.com,b@example.com'), false);
  assert.equal(isValidRecipient('a@example.com; b@example.com'), false);
});

test('isValidRecipient rejects garbage and empty input', () => {
  assert.equal(isValidRecipient(''), false);
  assert.equal(isValidRecipient('   '), false);
  assert.equal(isValidRecipient('not-an-email'), false);
  assert.equal(isValidRecipient('missing-domain@'), false);
});

test('refuses to send for a gallery that is not published, without contacting the mail provider or writing a row', async () => {
  const { deps: d, sent, recorded } = deps({ ok: true, providerId: 'x' });
  const unpublished: Gallery = { ...PUBLISHED, is_published: false };

  const result = await sendGalleryLink(unpublished, 'https://x/g/abc123/', 'client@example.com', undefined, d);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /not published/i);
  }
  assert.equal(sent.length, 0, 'must never call the mail provider for an unpublished gallery');
  assert.equal(recorded.length, 0, 'must never write a log row for a refusal — no attempt was made');
});

test('rejects a bad recipient before contacting the mail provider or writing a row', async () => {
  const { deps: d, sent, recorded } = deps({ ok: true, providerId: 'x' });

  const result = await sendGalleryLink(PUBLISHED, 'https://x/g/abc123/', 'a@example.com,b@example.com', undefined, d);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
  assert.equal(sent.length, 0);
  assert.equal(recorded.length, 0);
});

test('a successful send writes a "sent" row carrying the provider id', async () => {
  const { deps: d, recorded } = deps({ ok: true, providerId: 'resend-abc' });

  const result = await sendGalleryLink(PUBLISHED, 'https://x/g/abc123/', 'client@example.com', undefined, d);

  assert.equal(result.ok, true);
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], {
    gallery_id: 'g1',
    recipient: 'client@example.com',
    subject: 'Your photos from method26 are ready',
    status: 'sent',
    provider_id: 'resend-abc',
    error: null,
  });
});

test('a failed send still writes a row, with status "failed" and the error preserved', async () => {
  const { deps: d, recorded } = deps({ ok: false, error: 'resend-500' });

  const result = await sendGalleryLink(PUBLISHED, 'https://x/g/abc123/', 'client@example.com', undefined, d);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'resend-500');
  assert.equal(recorded.length, 1, 'a failed send must still be logged — absence cannot answer "did they get it"');
  assert.deepEqual(recorded[0], {
    gallery_id: 'g1',
    recipient: 'client@example.com',
    subject: 'Your photos from method26 are ready',
    status: 'failed',
    provider_id: null,
    error: 'resend-500',
  });
});

test('the failure is returned to the caller rather than reported as success', async () => {
  const { deps: d } = deps({ ok: false, error: 'network' });
  const result = await sendGalleryLink(PUBLISHED, 'https://x/g/abc123/', 'client@example.com', undefined, d);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 502);
    assert.equal(result.error, 'network');
  }
});

test('trims the recipient before sending and before recording', async () => {
  const { deps: d, sent, recorded } = deps({ ok: true, providerId: 'x' });
  await sendGalleryLink(PUBLISHED, 'https://x/g/abc123/', '  client@example.com  ', undefined, d);
  assert.equal((sent[0] as { to: string }).to, 'client@example.com');
  assert.equal((recorded[0] as { recipient: string }).recipient, 'client@example.com');
});

test('passes the gallery expiry through to the mail provider', async () => {
  const { deps: d, sent } = deps({ ok: true, providerId: 'x' });
  const expiring: Gallery = { ...PUBLISHED, expiration_date: '2026-12-25T00:00:00.000Z' };
  await sendGalleryLink(expiring, 'https://x/g/abc123/', 'client@example.com', undefined, d);
  assert.equal((sent[0] as { expiresAt: string | null }).expiresAt, '2026-12-25T00:00:00.000Z');
});
