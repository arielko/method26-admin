import type { GalleryEmailVariant } from './email-templates';

// One definition of where a gallery lives, used by the admin UI, by the send
// route, and by the email. The shapes have to match the site's own routes —
// _Website/src/pages/g/[token]/index.astro and .../finals.astro — and they
// have drifted twice now, so every caller comes through here and tests pin
// both.
//
// NEXT_PUBLIC_SITE_URL is inlined at build time from wrangler.jsonc's vars
// (see next.config.ts). There is deliberately no fallback: a wrong host here
// produces a link that looks right, is clickable, and 404s on somebody
// else's website. next.config.ts fails the build instead.
export const SITE_URL: string = process.env.NEXT_PUBLIC_SITE_URL as string;

/**
 * The proofing surface — the cover page, then the gate, then the frames the
 * client picks from.
 */
export function galleryUrl(token: string, site: string = SITE_URL): string {
  return `${site.replace(/\/+$/, '')}/g/${token}/`;
}

/**
 * The delivery surface — the retouched files, ready to download.
 *
 * A separate route, not a query on the proofing one: they are different
 * pages serving different photographs, and the finals page has no cover step
 * and no gate in front of it. A client who has been told their retouched
 * photographs are ready should land on the retouched photographs.
 */
export function finalsUrl(token: string, site: string = SITE_URL): string {
  return `${site.replace(/\/+$/, '')}/g/${token}/finals`;
}

/**
 * The URL an email of a given variant should point at. The 'finals' email
 * says "download your retouched photos" — it linked to the proofing landing,
 * which put a cover page and a picking wall between the client and the files
 * the email had just told them were ready.
 */
export function urlForVariant(
  token: string,
  variant: GalleryEmailVariant | undefined,
  site: string = SITE_URL
): string {
  return variant === 'finals' ? finalsUrl(token, site) : galleryUrl(token, site);
}
