import {
  buildGalleryShareEmailHtml,
  buildGalleryShareEmailText,
  GALLERY_EMAIL_DEFAULTS,
  type GalleryEmailVariant,
} from './email-templates.ts';

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
  /** Overrides the variant's default subject when the studio edits it. */
  subject?: string;
};

// Anything shaped like an address becomes <email>. Deliberately broad: this
// runs over text from a third party, and over-redacting costs a little
// clarity while under-redacting writes a client's address into a log.
export function redactEmails(text: string): string {
  return text.replace(/[^\s<>"']+@[^\s<>"']+\.[^\s<>"',;)]+/g, '<email>');
}

// `studio@method26.com` or `method26 <studio@method26.com>` — the two shapes
// Resend accepts. Checked here rather than discovered from a 422, because a
// misconfigured sender fails identically for every recipient and there is no
// reason to learn that one round trip at a time.
//
// The failure this catches for real: a value pasted into `wrangler secret put`
// with its surrounding quotes included, which stores a literal `"` inside the
// address. That is invisible in `wrangler secret list`, which shows only
// names, and it already cost this project an afternoon on the Supabase keys.
const FROM_RE = /^(?:[^\s<>@,"']+@[^\s<>@,"']+\.[^\s<>@,"']+|[^<>"']+<[^\s<>@,"']+@[^\s<>@,"']+\.[^\s<>@,"']+>)$/;

export function isValidFromAddress(value: string): boolean {
  return FROM_RE.test(value.trim());
}

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
  if (!isValidFromAddress(from)) {
    throw new Error(
      'Gallery email is not configured: GALLERY_EMAIL_FROM must be ' +
        '`studio@example.com` or `Name <studio@example.com>` — check for stray ' +
        'quotes around the value, which `wrangler secret put` stores verbatim'
    );
  }

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
        subject: input.subject?.trim() || GALLERY_EMAIL_DEFAULTS[input.variant ?? 'proofing'].subject,
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
      // The status alone was undiagnosable. A real send failed with
      // `resend-422` and there was no way to tell a malformed From address
      // from an unverified domain from a bad payload — the studio could only
      // guess, and so could I.
      //
      // Resend's message is what says which. It is included, with every email
      // address stripped out first: the error text echoes the request back,
      // and a recipient's address must not travel any further than the person
      // who typed it. The studio's own From address goes the same way — it is
      // named by GALLERY_EMAIL_FROM, so the operator can already read it.
      const detail = await res
        .json()
        .then((body: { name?: string; message?: string }) =>
          [body.name, body.message].filter(Boolean).join(': ')
        )
        .catch(() => '');
      const safe = redactEmails(detail).slice(0, 300);
      return { ok: false, error: safe ? `resend-${res.status} ${safe}` : `resend-${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, providerId: data.id ?? '' };
  } catch {
    return { ok: false, error: 'network' };
  }
}
