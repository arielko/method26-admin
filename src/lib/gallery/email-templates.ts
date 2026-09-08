// Email templates for method26, replicating the structure of the Argento
// Headshots system this gallery is modelled on: a 600px table, a header
// carrying the logo and the studio's location, an optional hero image, the
// content block, and a dark footer with the NAP.
//
// Table layout and inline styles are not old-fashioned here, they are
// required: Gmail strips <style> blocks, Outlook renders through Word, and
// flexbox is unsupported in both. Everything below is deliberate.

const PAPER = '#F6F6F4';
const CARD = '#FFFFFF';
const INK = '#141518';
// Deliberately absent: the brand grey #727A80. It measures 4.03:1 on paper and
// 4.18:1 on ink, below the 4.5:1 small-text floor on both, so — exactly as on
// the site — it carries no text under 32px and there is no text over 32px here.
// Secondary lines take their hierarchy from size, tracking and case instead,
// the way `.mono` does in _Website/src/styles/global.css.
const STONE = '#E8E9E6';
const AMBER = '#D77D20';

// Where the logo is fetched from. Email clients block SVG widely, so this is
// the PNG the site already serves. It must be a public absolute URL — an
// email is read far from this Worker.
// The lockup — the mark and the wordmark together, as one image. Gmail and
// Outlook do not render SVG at all, so this is the PNG the site builds from
// src/generated/logo/lockup.svg (see _Website/scripts/build-icons.mjs).
// Drawn at 520px for a 260px box so it stays crisp on a 2x screen.
const LOGO_URL =
  process.env.GALLERY_EMAIL_LOGO_URL ||
  'https://method26.com/email-logo.png';
const LOGO_WIDTH = 260;
const LOGO_HEIGHT = 50;

const STUDIO = {
  name: 'method26',
  location: 'Silver Lake • Los Angeles',
  street: '4242 W. Sunset Blvd, Suite 9',
  cityLine: 'Los Angeles, CA 90029',
  phone: '323-669-8660',
  email: 'info@method26.com',
};

// The studio's own clock, not the host's. A Worker runs in UTC, so
// `toLocaleDateString` with no zone renders an expiry of midnight Pacific as
// the previous day — telling a client their gallery closes a day before it
// does. Both callers below format through here so they cannot drift apart.
// Returns null for a timestamp that will not parse, so the sentence is
// dropped rather than printed as "Available until Invalid Date".
export function formatExpiryDate(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only http(s) may reach an href or src. A `javascript:` URL in an email is
// inert in most clients but not all, and this value can originate from a
// database row rather than from us.
export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

export function baseLayout(
  content: string,
  options?: { heroImageUrl?: string; heroImageAlt?: string; previewText?: string }
): string {
  const hero = options?.heroImageUrl ? sanitizeUrl(options.heroImageUrl) : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- No webfont <link>: Gmail and Outlook drop remote @font-face outright, so
       it would buy nothing, while the clients that do honour it would fetch a
       third-party stylesheet on open and leak when this mail was read. Every
       font-family below falls back through the system stack instead. -->
  <title>${escapeHtml(STUDIO.name)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAPER};font-family:Archivo,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  ${
    options?.previewText
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.previewText)}</div>`
      : ''
  }
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAPER};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:${CARD};max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 0;text-align:center;border-bottom:1px solid ${STONE};">
              <!-- The lockup carries the name, so the wordmark is not repeated
                   as text beneath it. alt does the work when images are
                   blocked, which is the default in a lot of mail clients. -->
              <img src="${escapeHtml(LOGO_URL)}" alt="${escapeHtml(STUDIO.name)}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" style="display:block;margin:0 auto;width:${LOGO_WIDTH}px;height:auto;max-width:70%;" />
              <p style="margin:0;padding:14px 0 18px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${INK};font-family:'IBM Plex Mono',ui-monospace,monospace;">
                ${STUDIO.location}
              </p>
            </td>
          </tr>
          ${
            hero
              ? `<!-- Hero -->
          <tr>
            <td style="padding:0;">
              <img src="${escapeHtml(hero)}" alt="${escapeHtml(options?.heroImageAlt || '')}" style="display:block;width:100%;height:auto;" />
            </td>
          </tr>`
              : ''
          }
          <!-- Content -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:30px 40px;background-color:${INK};text-align:center;">
              <p style="margin:0 0 10px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${CARD};font-family:'IBM Plex Mono',ui-monospace,monospace;">
                ${escapeHtml(STUDIO.name)}
              </p>
              <p style="margin:0 0 4px;font-size:12px;color:${STONE};">
                ${escapeHtml(STUDIO.street)} &bull; ${escapeHtml(STUDIO.cityLine)}
              </p>
              <p style="margin:0 0 4px;font-size:12px;color:${STONE};">
                ${escapeHtml(STUDIO.phone)} &bull; <a href="mailto:${escapeHtml(STUDIO.email)}" style="color:${STONE} !important;text-decoration:none !important;"><span style="color:${STONE};">${escapeHtml(STUDIO.email)}</span></a>
              </p>
              <p style="margin:16px 0 0;font-size:11px;color:${STONE};">
                &copy; ${new Date().getFullYear()} ${escapeHtml(STUDIO.name)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// A bulletproof-ish button. Ink on paper rather than amber: amber is 2.84:1
// on white and fails even the non-text floor, so it appears here only as the
// rule above the credential warning — a mark, never a label's background.
function button(href: string, label: string): string {
  const url = sanitizeUrl(href);
  if (!url) return '';
  return `<table cellpadding="0" cellspacing="0" style="margin:28px 0;">
  <tr>
    <td style="background-color:${INK};">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${CARD};text-decoration:none;font-family:'IBM Plex Mono',ui-monospace,monospace;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

export type GalleryEmailVariant = 'proofing' | 'finals';

// The copy each variant sends when the studio doesn't write its own. The
// share screen prefills its Subject and Message fields from exactly this, so
// what the preview shows is what the template renders — there is no second,
// drifting copy of the wording living in the UI.
export const GALLERY_EMAIL_DEFAULTS: Record<
  GalleryEmailVariant,
  { label: string; subject: string; heading: string; body: string; cta: string }
> = {
  proofing: {
    label: 'Gallery delivery',
    subject: 'Your photos from method26 are ready!',
    heading: 'Your photos are ready',
    body: "Hello!\n\nYour photos are now ready! You're invited to view the images from your session — just click the link below to access your private online gallery.\n\nIt was such a pleasure working with you. Thank you for choosing method26!\n\nWarmly,\nmethod26",
    cta: 'View gallery',
  },
  finals: {
    label: 'Retouched downloads',
    subject: 'Your retouched photos are ready — method26',
    heading: 'Your retouched photos are ready',
    body: 'Hi there,\n\nGreat news — your retouched photos are ready for download! Click the button below to access your gallery and save your final images.\n\nWe hope you love them!\n\nBest,\nmethod26',
    cta: 'Download photos',
  },
};

export function buildGalleryShareEmailHtml(input: {
  galleryName: string;
  url: string;
  message?: string | null;
  coverImageUrl?: string | null;
  expiresAt?: string | null;
  variant?: GalleryEmailVariant;
}): string {
  const variant: GalleryEmailVariant = input.variant ?? 'proofing';
  const defaults = GALLERY_EMAIL_DEFAULTS[variant];
  const name = escapeHtml(input.galleryName);

  const heading = defaults.heading;
  // A message the studio typed replaces the default body rather than sitting
  // above it. Two paragraphs saying the same thing in different words is what
  // an "optional note" field produces in practice, and the share screen
  // prefills this box with the default so replacing it is the normal case.
  const body = input.message?.trim() || defaults.body;
  const cta = defaults.cta;

  const expiresOn = input.expiresAt ? formatExpiryDate(input.expiresAt) : null;
  const expiry = expiresOn
    ? `<p style="margin:0 0 4px;font-size:13px;color:${INK};font-family:'IBM Plex Mono',ui-monospace,monospace;">
         Available until ${escapeHtml(expiresOn)}.
       </p>`
    : '';

  const content = `
    <h1 style="margin:0 0 8px;font-size:26px;line-height:1.2;font-weight:700;color:${INK};font-family:Archivo,-apple-system,BlinkMacSystemFont,sans-serif;">${heading}</h1>
    <p style="margin:0 0 24px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${INK};font-family:'IBM Plex Mono',ui-monospace,monospace;">${name}</p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${INK};white-space:pre-line;">${escapeHtml(body)}</p>
    ${button(input.url, cta)}
    <div style="border-top:2px solid ${AMBER};padding-top:16px;margin-top:8px;">
      <p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:${INK};">
        This link is the only credential &mdash; anyone who has it can see the work, so pass it on only to people who should.
      </p>
      ${expiry}
    </div>`;

  return baseLayout(content, {
    heroImageUrl: input.coverImageUrl || undefined,
    heroImageAlt: input.galleryName,
    previewText: `${heading} ${input.galleryName}`,
  });
}

// Plain-text alternative. Sent alongside the HTML: a message with no text
// part is markedly more likely to be filed as spam, and some clients still
// prefer it.
export function buildGalleryShareEmailText(input: {
  galleryName: string;
  url: string;
  message?: string | null;
  expiresAt?: string | null;
  variant?: GalleryEmailVariant;
}): string {
  const variant: GalleryEmailVariant = input.variant ?? 'proofing';
  const defaults = GALLERY_EMAIL_DEFAULTS[variant];
  // No heading line: the body copy opens with its own greeting, and repeating
  // "Your photos are ready" immediately above "Hello!" reads as a machine
  // talking over itself.
  const lines = [input.galleryName, ''];
  lines.push(
    input.message?.trim() || defaults.body,
    '',
    sanitizeUrl(input.url),
    '',
    'This link is the only credential - anyone who has it can see the work.'
  );
  const expiresOn = input.expiresAt ? formatExpiryDate(input.expiresAt) : null;
  if (expiresOn) lines.push(`Available until ${expiresOn}.`);
  lines.push('', `${STUDIO.name} - ${STUDIO.street}, ${STUDIO.cityLine}`, `${STUDIO.phone} - ${STUDIO.email}`);
  return lines.join('\n');
}
