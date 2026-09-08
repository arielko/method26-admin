// One definition of where a gallery lives, used by the admin UI, by the send
// route, and by the email. The shape has to match the site's own route —
// _Website/src/pages/g/[token]/index.astro — and it drifted once already,
// so both callers now come through here and a test pins the shape.
//
// NEXT_PUBLIC_SITE_URL is inlined at build time from wrangler.jsonc's vars
// (see next.config.ts). There is deliberately no fallback: a wrong host here
// produces a link that looks right, is clickable, and 404s on somebody
// else's website. next.config.ts fails the build instead.
export const SITE_URL: string = process.env.NEXT_PUBLIC_SITE_URL as string;

export function galleryUrl(token: string, site: string = SITE_URL): string {
  return `${site.replace(/\/+$/, '')}/g/${token}/`;
}
