// Orchestrates one "send a client their gallery link" attempt. Kept apart
// from the route handler so it can be unit tested with plain injected
// functions — no NextRequest, no live Supabase, no live Resend — the same
// split this codebase already uses for image-variant.ts and
// analytics-tab.ts.
import type { Gallery } from './types';
import type { MailResult } from './mail';

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
