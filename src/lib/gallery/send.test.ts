import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendGalleryLink,
  sendGalleryLinks,
  isValidRecipient,
  type RecordGalleryEmailRow,
  type SendGalleryLinkDeps,
} from './send.ts';
import { GALLERY_EMAIL_DEFAULTS } from './email-templates.ts';
import type { MailResult } from './mail.ts';
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

// --- sendGalleryLinks (many recipients) ---------------------------------

function galleryFixture(overrides: Partial<Gallery> = {}): Gallery {
  return { ...PUBLISHED, ...overrides };
}

function recordingDeps(behaviour: (to: string) => MailResult) {
  const sends: { to: string; subject?: string; variant?: string; message?: string }[] = [];
  const rows: RecordGalleryEmailRow[] = [];
  return {
    sends,
    rows,
    deps: {
      send: async (input: { to: string; subject?: string; variant?: string; message?: string }) => {
        sends.push(input);
        return behaviour(input.to);
      },
      record: async (row: RecordGalleryEmailRow) => {
        rows.push(row);
      },
    } as unknown as SendGalleryLinkDeps,
  };
}

test('each recipient gets their own message, never a shared To: line', async () => {
  const { sends, deps } = recordingDeps(() => ({ ok: true, providerId: 'p' }));
  const result = await sendGalleryLinks(
    galleryFixture(),
    'https://method26.example/g/tok/',
    { recipients: ['a@example.com', 'b@example.com'] },
    deps
  );
  assert.ok(result.ok);
  assert.deepEqual(sends.map((s) => s.to), ['a@example.com', 'b@example.com']);
  for (const send of sends) {
    assert.ok(!send.to.includes(','), 'one address per send');
  }
});

test('one failure does not stop the others, and names the address that failed', async () => {
  const { deps } = recordingDeps((to) =>
    to === 'b@example.com' ? { ok: false, error: 'resend-422' } : { ok: true, providerId: 'p' }
  );
  const result = await sendGalleryLinks(
    galleryFixture(),
    'https://method26.example/g/tok/',
    { recipients: ['a@example.com', 'b@example.com', 'c@example.com'] },
    deps
  );
  assert.ok(result.ok);
  assert.deepEqual(
    result.results.map((r) => [r.email, r.ok]),
    [['a@example.com', true], ['b@example.com', false], ['c@example.com', true]]
  );
  assert.equal(result.results[1].error, 'resend-422');
});

test('every attempt is logged, successes and failures alike', async () => {
  const { rows, deps } = recordingDeps((to) =>
    to === 'b@example.com' ? { ok: false, error: 'resend-500' } : { ok: true, providerId: 'pid' }
  );
  await sendGalleryLinks(
    galleryFixture(),
    'https://method26.example/g/tok/',
    { recipients: ['a@example.com', 'b@example.com'] },
    deps
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'sent');
  assert.equal(rows[0].provider_id, 'pid');
  assert.equal(rows[1].status, 'failed');
  assert.equal(rows[1].error, 'resend-500');
});

test('a duplicate address is sent to once', async () => {
  const { sends, deps } = recordingDeps(() => ({ ok: true, providerId: 'p' }));
  await sendGalleryLinks(
    galleryFixture(),
    'https://method26.example/g/tok/',
    { recipients: ['A@Example.com', 'a@example.com', ' a@example.com '] },
    deps
  );
  assert.deepEqual(sends.map((s) => s.to), ['a@example.com']);
});

test('a single bad address refuses the whole send before anything goes out', async () => {
  const { sends, rows, deps } = recordingDeps(() => ({ ok: true, providerId: 'p' }));
  const result = await sendGalleryLinks(
    galleryFixture(),
    'https://method26.example/g/tok/',
    { recipients: ['a@example.com', 'not-an-email'] },
    deps
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /not-an-email/);
  }
  assert.equal(sends.length, 0, 'nothing may be sent');
  assert.equal(rows.length, 0, 'and nothing logged — there was no attempt');
});

test('an unpublished gallery is refused before any send', async () => {
  const { sends, deps } = recordingDeps(() => ({ ok: true, providerId: 'p' }));
  const result = await sendGalleryLinks(
    galleryFixture({ is_published: false }),
    'https://method26.example/g/tok/',
    { recipients: ['a@example.com'] },
    deps
  );
  assert.equal(result.ok, false);
  assert.equal(sends.length, 0);
});

test('the subject falls back to the variant default and is logged as sent', async () => {
  const { sends, rows, deps } = recordingDeps(() => ({ ok: true, providerId: 'p' }));
  await sendGalleryLinks(
    galleryFixture(),
    'https://method26.example/g/tok/',
    { recipients: ['a@example.com'], variant: 'finals' },
    deps
  );
  assert.equal(sends[0].subject, GALLERY_EMAIL_DEFAULTS.finals.subject);
  assert.equal(rows[0].subject, GALLERY_EMAIL_DEFAULTS.finals.subject);
});

test('an edited subject is what sends and what is logged', async () => {
  const { sends, rows, deps } = recordingDeps(() => ({ ok: true, providerId: 'p' }));
  await sendGalleryLinks(
    galleryFixture(),
    'https://method26.example/g/tok/',
    { recipients: ['a@example.com'], subject: 'Frames from Tuesday' },
    deps
  );
  assert.equal(sends[0].subject, 'Frames from Tuesday');
  assert.equal(rows[0].subject, 'Frames from Tuesday');
});
