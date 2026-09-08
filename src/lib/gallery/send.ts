// Orchestrates one "send a client their gallery link" attempt. Kept apart
// from the route handler so it can be unit tested with plain injected
// functions — no NextRequest, no live Supabase, no live Resend — the same
// split this codebase already uses for image-variant.ts and
// analytics-tab.ts.
import type { Gallery } from './types';
import type { MailResult } from './mail';
import { GALLERY_EMAIL_DEFAULTS, type GalleryEmailVariant } from './email-templates.ts';

// A single address, nothing else. Rejects a comma- or semicolon-joined
// list up front rather than relying on the eventual "to: [x]" array shape
// to hide a second recipient the caller never confirmed sending to.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function isValidRecipient(raw: string): boolean {
  const value = raw.trim();
  return value.length > 0 && EMAIL_RE.test(value);
}

export type RecordGalleryEmailRow = {
  gallery_id: string;
  recipient: string;
  subject: string;
  status: 'sent' | 'failed';
  provider_id?: string | null;
  error?: string | null;
};

export type SendGalleryLinkDeps = {
  send: (input: {
    to: string;
    galleryName: string;
    url: string;
    message?: string;
    expiresAt?: string | null;
    variant?: GalleryEmailVariant;
    subject?: string;
    coverImageUrl?: string | null;
  }) => Promise<MailResult>;
  record: (row: RecordGalleryEmailRow) => Promise<void>;
};

export type SendGalleryLinkResult = { ok: true } | { ok: false; status: number; error: string };

export const GALLERY_EMAIL_SUBJECT = 'Your photos from method26 are ready';

/**
 * Refusals here (unpublished gallery, bad recipient) never touch Resend
 * and never write a gallery_emails row — there was no delivery attempt to
 * log. Once an attempt is actually made, success and failure are both
 * recorded, because "did the client ever get it" is unanswerable from
 * silence.
 */
export async function sendGalleryLink(
  gallery: Gallery,
  url: string,
  rawRecipient: string,
  message: string | undefined,
  deps: SendGalleryLinkDeps
): Promise<SendGalleryLinkResult> {
  // The link 404s for anyone who opens it if the gallery isn't published —
  // sending it out would just be handing the client a broken link.
  if (!gallery.is_published) {
    return {
      ok: false,
      status: 400,
      error: 'This gallery is not published yet — the link would 404 for the recipient.',
    };
  }

  const recipient = rawRecipient.trim();
  if (!isValidRecipient(recipient)) {
    return { ok: false, status: 400, error: 'Enter one valid email address.' };
  }

  const result = await deps.send({
    to: recipient,
    galleryName: gallery.name,
    url,
    message,
    expiresAt: gallery.expiration_date,
  });

  await deps.record({
    gallery_id: gallery.id,
    recipient,
    subject: GALLERY_EMAIL_SUBJECT,
    status: result.ok ? 'sent' : 'failed',
    provider_id: result.ok ? result.providerId || null : null,
    error: result.ok ? null : result.error,
  });

  if (!result.ok) {
    return { ok: false, status: 502, error: result.error };
  }
  return { ok: true };
}


// --- Multiple recipients -----------------------------------------------

export type SendGalleryLinksInput = {
  recipients: string[];
  subject?: string;
  message?: string;
  variant?: GalleryEmailVariant;
  coverImageUrl?: string | null;
};

export type RecipientResult = { email: string; ok: boolean; error?: string };

export type SendGalleryLinksResult =
  | { ok: true; results: RecipientResult[] }
  | { ok: false; status: number; error: string };

// Deduplicated case-insensitively, because the share screen lets an address
// arrive from a chip, a suggestion and a paste in the same session, and a
// client receiving the same gallery three times reads as a mistake.
export function normalizeRecipients(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const value = entry.trim().toLowerCase();
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * Sends one gallery link to many recipients, one message each — never a
 * shared To: line, which would disclose every client's address to every
 * other client.
 *
 * A failure for one address does not abort the rest: the studio needs the
 * other nine to arrive, and needs to be told precisely which one did not.
 * Every attempt is logged whether it succeeded or failed, since "did the
 * client ever get it" is unanswerable from silence.
 */
export async function sendGalleryLinks(
  gallery: Gallery,
  url: string,
  input: SendGalleryLinksInput,
  deps: SendGalleryLinkDeps
): Promise<SendGalleryLinksResult> {
  if (!gallery.is_published) {
    return {
      ok: false,
      status: 400,
      error: 'This gallery is not published yet — the link would 404 for the recipient.',
    };
  }

  const recipients = normalizeRecipients(input.recipients);
  if (recipients.length === 0) {
    return { ok: false, status: 400, error: 'Add at least one recipient.' };
  }

  const invalid = recipients.filter((email) => !isValidRecipient(email));
  if (invalid.length > 0) {
    // Refused before any send, so a typo cannot result in nine delivered
    // messages and a tenth the studio has to chase.
    return { ok: false, status: 400, error: `Not a valid email address: ${invalid.join(', ')}` };
  }

  const variant: GalleryEmailVariant = input.variant ?? 'proofing';
  const subject = input.subject?.trim() || GALLERY_EMAIL_DEFAULTS[variant].subject;

  const results: RecipientResult[] = [];
  for (const recipient of recipients) {
    let result: MailResult;
    try {
      result = await deps.send({
        to: recipient,
        galleryName: gallery.name,
        url,
        message: input.message,
        expiresAt: gallery.expiration_date,
        variant,
        subject,
        coverImageUrl: input.coverImageUrl,
      });
    } catch (caught) {
      // A throw here is a configuration fault (no API key), not a per-address
      // one — it will throw identically for everyone, so stop rather than
      // write nine identical failure rows.
      throw caught;
    }

    await deps.record({
      gallery_id: gallery.id,
      recipient,
      subject,
      status: result.ok ? 'sent' : 'failed',
      provider_id: result.ok ? result.providerId || null : null,
      error: result.ok ? null : result.error,
    });

    results.push(
      result.ok ? { email: recipient, ok: true } : { email: recipient, ok: false, error: result.error }
    );
  }

  return { ok: true, results };
}
