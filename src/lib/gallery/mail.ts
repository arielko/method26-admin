// Delivers via Resend's HTTP API rather than its SDK — one POST, no
// dependency, same approach the public site takes for inquiry mail (see
// ../_Website/src/lib/mail.ts). Plain text only: no HTML template means no
// tracking pixel and no image loaded from anywhere else, and a gallery
// link doesn't need a layout to read clearly.

export type SendGalleryEmailInput = {
  to: string;
  galleryName: string;
  url: string;
  message?: string;
  /** ISO timestamp. Omitted or null means the link has no expiry. */
  expiresAt?: string | null;
};

export type MailResult = { ok: true; providerId: string } | { ok: false; error: string };

function buildBody(input: SendGalleryEmailInput): string {
  const lines = [`Hi,`, ``, `Your photographs from ${input.galleryName} are ready to view.`, ``];

  const message = input.message?.trim();
  if (message) {
    lines.push(message, ``);
  }

  lines.push(`View your gallery: ${input.url}`, ``);

  // The token in that link is the only thing standing between this
  // gallery and anyone who has the URL — see src/lib/gallery/token.ts.
  // Said once, plainly, rather than assumed.
  lines.push(
    `This link is the only credential protecting your gallery — please don't forward it to anyone you don't want to have access.`
  );

  if (input.expiresAt) {
    const formatted = new Date(input.expiresAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    lines.push(`This link expires ${formatted}.`);
  }

  lines.push(``, `— method26 Studio`);
  return lines.join('\n');
}

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
        subject: `Your photos from method26 are ready`,
        text: buildBody(input),
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
