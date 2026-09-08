# Deploying method26-admin

**Deployed:** https://method26-admin.intellidot.workers.dev
**Worker:** `method26-admin` (Cloudflare, via `@opennextjs/cloudflare`)

```bash
npm run build && npx wrangler deploy
```

## Verification, 2026-09-07

Real output against the deployed Worker:

| Check | Command | Result |
|---|---|---|
| Dashboard is gated | `curl -o /dev/null -w '%{http_code} %{redirect_url}' $A/gallery` | `307 -> /login` |
| Collections API rejects anonymous callers | `curl -o /dev/null -w '%{http_code}' $A/api/gallery/collections` | `401` |
| **Signing route rejects anonymous callers** | `curl -X POST $A/api/gallery/presign -d '{"collectionId":"x","photoId":"x","extension":".jpg","contentType":"image/jpeg"}'` | **`401`** |

The third line is the one to re-run after any change. `src/middleware.ts` deliberately exempts
`/api`, so nothing upstream protects these routes — a `200` there means anyone on the internet
can mint write URLs for the storage bucket. `src/lib/gallery/surface.test.ts` enforces the same
property at build time: every `route.ts`/`route.tsx`/`route.js` must both call
`authenticateSession(` and return `unauthorizedResponse(` guarded on the result.

## Configuration

Two different mechanisms, because of *when* each value is needed:

**Build-time — `wrangler.jsonc`'s `vars`, committed plaintext:**

```
NEXT_PUBLIC_SUPABASE_URL   NEXT_PUBLIC_SUPABASE_ANON_KEY   NEXT_PUBLIC_SITE_URL
```

`NEXT_PUBLIC_*` values are inlined into the client bundle by `next build`, not read from the
Worker at request time — they never reach `wrangler secret put` at all, because there is no
request yet for a secret binding to answer. `src/app/login/page.tsx` is a client component, so a
clean checkout or a CI runner without a hand-copied `.env.local` used to bake in `undefined` and
ship a login page that fails opaquely. `opennextjs-cloudflare build` reads `wrangler.jsonc`'s
`vars` and populates the build environment from it before invoking `next build`, so these values
now survive a clean checkout on any machine. An anon key is public by design — the prefix is the
promise — so committing it plaintext costs nothing.

**Runtime — secrets, set with `npx wrangler secret put NAME`:**

```
SUPABASE_URL   SUPABASE_ANON_KEY   SUPABASE_SERVICE_ROLE_KEY
B2_KEY_ID      B2_APP_KEY          B2_BUCKET   B2_REGION
RESEND_API_KEY GALLERY_EMAIL_FROM
```

These are read via `process.env` inside Worker code at request time and must never be committed —
`SUPABASE_SERVICE_ROLE_KEY` in particular bypasses RLS entirely. `wrangler.jsonc`'s `vars` held
placeholders here once — `SUPABASE_URL` as `https://your-project.supabase.co` — which deployed
looking configured and failed at runtime; a missing secret now fails closed instead.

`RESEND_API_KEY` and `GALLERY_EMAIL_FROM` back the Send action on a gallery row
(src/lib/gallery/mail.ts) — without both set, sending throws naming whichever is missing rather
than silently no-op'ing. `GALLERY_EMAIL_FROM` isn't secret in the way a key is, but it's set the
same way so a bad value can't ship from a committed placeholder either — e.g.
`"method26 Studio <studio@method26.com>"`, a sender on a domain verified in Resend.

**Check `npx wrangler secret list` after setting them.** A malformed invocation can create a
secret whose *name* is the value; names are not secret, so a key pasted into that field is
exposed in listings, the dashboard and deploy output. That happened once here and was cleaned up.

## Accounts

There is no sign-up route, deliberately. The only accounts are ones created in the Supabase
dashboard under Authentication → Users.

## Storage

Bucket `method26-gallery` at `s3.us-west-004.backblazeb2.com`, **private**. Privacy is load
bearing: the public site withholds full-resolution originals from its proofing surface and
serves them only through short-lived signed URLs, and every one of those properties is void if
the bucket answers unsigned reads. Verify with:

```bash
curl -o /dev/null -w '%{http_code}\n' "https://s3.us-west-004.backblazeb2.com/method26-gallery/<any-key>"
```

**401 is correct. A 200 means the bucket is public and every original is world-readable.**

A CORS rule (`method26AdminUpload`, `s3_put`, origins `http://localhost:3000` and this Worker)
permits browser-direct uploads. Without it, uploads fail as `Failed to fetch` rather than with an
HTTP status.
