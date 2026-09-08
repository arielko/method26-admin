import { buildGalleryShareEmailHtml, buildGalleryShareEmailText, type GalleryEmailVariant } from './email-templates.ts';

// Delivers via Resend's HTTP API rather than its SDK — one POST, no
// dependency, same approach the public site takes for inquiry mail (see
// ../_Website/src/lib/mail.ts).
//
// Sends multipart: the branded HTML from ./email-templates plus a plain-text
// alternative. Both, not either — a message with no text part is markedly
// more likely to be filed as spam, and the text version is what a screen
// reader and a watch notification actually read.
//
// The template loads exactly one remote image, the studio's own logo, and
// optionally the gallery's cover photograph. No tracking pixel, no third-party
// asset: this mail carries a credential, and a request to somebody else's
// server on open is a request that leaks when it was opened and from where.

export type SendGalleryEmailInput = {
  to: string;
  galleryName: string;
  url: string;
  message?: string;
  /** ISO timestamp. Omitted or null means the link has no expiry. */
  expiresAt?: string | null;
  /** Absolute URL of the gallery's cover photograph, used as the hero. */
  coverImageUrl?: string | null;
  /** 'finals' changes the heading and the call to action to a download. */
  variant?: GalleryEmailVariant;
};

export type MailResult = { ok: true; providerId: string } | { ok: false; error: string };

export async function sendGalleryEmail(
  input: SendGalleryEmailInput,
  fetchImpl: typeof fetch = fetch
): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.GALLERY_EMAIL_FROM;

  // Fail closed, loudly, and before any network call: sending with an
  // empty key doesn't fail at Resend the way you'd expect, and a
  // misconfigured deploy would otherwise look like a working one right up
  // until a client asks where their gallery went. Naming the variable in
  // the message points straight at `wrangler secret put`.
  if (!apiKey) throw new Error('Gallery email is not configured: RESEND_API_KEY is unset');
  if (!from) throw new Error('Gallery email is not configured: GALLERY_EMAIL_FROM is unset');

  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject:
          input.variant === 'finals'
            ? 'Your final photographs from method26 are ready'
            : 'Your photos from method26 are ready',
        html: buildGalleryShareEmailHtml({
          galleryName: input.galleryName,
          url: input.url,
          message: input.message,
          coverImageUrl: input.coverImageUrl,
          expiresAt: input.expiresAt,
          variant: input.variant,
        }),
        text: buildGalleryShareEmailText({
          galleryName: input.galleryName,
          url: input.url,
          message: input.message,
          expiresAt: input.expiresAt,
          variant: input.variant,
        }),
      }),
    });

    if (!res.ok) {
      // The status code, not the response body — Resend's error text can
      // echo the request back, and the recipient address must never
      // travel any further than the caller who already typed it.
      return { ok: false, error: `resend-${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, providerId: data.id ?? '' };
  } catch {
    return { ok: false, error: 'network' };
  }
}
