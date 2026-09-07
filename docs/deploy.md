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
| **Signing route rejects anonymous callers** | `curl -X POST $A/api/gallery/presign -d '{"objects":[…]}'` | **`401`** |

The third line is the one to re-run after any change. `src/middleware.ts` deliberately exempts
`/api`, so nothing upstream protects these routes — a `200` there means anyone on the internet
can mint write URLs for the storage bucket. `src/lib/gallery/surface.test.ts` enforces the same
property at build time by asserting every `route.ts` imports `@/lib/api/auth`.

## Configuration

Nine secrets, set with `npx wrangler secret put NAME`:

```
NEXT_PUBLIC_SUPABASE_URL   NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL               SUPABASE_ANON_KEY               SUPABASE_SERVICE_ROLE_KEY
B2_KEY_ID                  B2_APP_KEY                      B2_BUCKET   B2_REGION
```

`wrangler.jsonc` holds **no** `vars`. The fork shipped placeholders there — `SUPABASE_URL` as
`https://your-project.supabase.co` — which would have deployed looking configured and failed at
runtime. Every value now comes from a secret, and a missing one fails closed.

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
