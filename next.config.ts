import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

// wrangler.jsonc's `vars` exist only at RUN time, on the server. Every
// NEXT_PUBLIC_* value a client component reads is inlined at BUILD time.
// Those are different moments, and nothing connects them on its own — so a
// var set in wrangler.jsonc and nowhere else reaches the server and never
// reaches the browser, where the component silently uses its fallback.
//
// That shipped: NEXT_PUBLIC_SITE_URL was set in wrangler.jsonc and absent at
// build time, so PublishPanel's `?? 'https://method26.com'` was inlined and
// every gallery link in the admin — the URL under the name, Copy, and Open —
// pointed at the WordPress site, which 404s on /g/<token>/. The Supabase
// values escaped only because they also happen to sit in a gitignored
// .env.local on one machine; a build anywhere else would have broken login
// the same way.
//
// So wrangler.jsonc is the single source of truth and the build reads it.
// A real environment variable still wins, for CI and for a production build
// that targets the apex domain.
function publicVarsFromWrangler(): Record<string, string> {
  const source = readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8");
  // Comments only — wrangler.jsonc has no trailing commas, and a full JSONC
  // parser is not worth a dependency for one file we control.
  const vars = JSON.parse(source.replace(/^\s*\/\/.*$/gm, "")).vars ?? {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (!key.startsWith("NEXT_PUBLIC_")) continue;
    if (typeof value !== "string") continue;
    out[key] = process.env[key] ?? value;
  }
  return out;
}

const publicVars = publicVarsFromWrangler();

// Fail the build rather than ship a link to somebody else's website. A
// missing value here is invisible at runtime: the page renders, the button
// is clickable, and it goes to the wrong host.
for (const required of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  if (!publicVars[required]) {
    throw new Error(
      `${required} is not set. Add it to wrangler.jsonc "vars" so the build and the Worker agree on one value.`
    );
  }
}

const nextConfig: NextConfig = {
  env: publicVars,
};

export default nextConfig;
