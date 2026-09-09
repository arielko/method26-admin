import { SITE_URL } from '@/lib/gallery/site-url';

/**
 * Where a transfer lives on the public site — _Website/src/pages/f/[token].
 *
 * `/f/`, not `/g/`: a transfer is not a gallery, and sharing the prefix would
 * mean one route had to work out which of two tables a token belonged to on
 * every request.
 */
export function dropUrl(token: string, site: string = SITE_URL): string {
  return `${site.replace(/\/+$/, '')}/f/${token}`;
}
