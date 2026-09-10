# Method 26 — Digital Home progress

Single source of truth for where this build stands. Read this before continuing
the mission in a new session.

- **Owner:** Ariel
- **Business:** Method 26 — graphic design studio, Silver Lake, Los Angeles.
  Also client photo proofing/selection and retouched-file delivery.
- **Adopted:** 2026-09-10 by Simon, via a read-only foundations audit.
  This Home was built before Simon; it was not stood up from the starter here.
- **Shared registry id:** `dh_06b219f7dafe`

## Production

| Piece | Where | State (2026-09-10) |
|-------|-------|--------------------|
| Public site | https://method26.com (+ www) | Live, 200, serving the Astro site. Replaced the old WordPress. |
| Admin | https://studio.method26.com | Live. Redirects to `/login`; login loads. |
| Backend Worker | Cloudflare `method26-admin` | Custom domain `studio.method26.com`. Deploy: `npm run deploy`. |
| Frontend Worker | Cloudflare `method26` | Routes `method26.com/*`, `www.method26.com/*`. |
| Database | Supabase project `hyfcsqrwlolkkxopmcqj` | Live and healthy. Used by both repos. |

## Repositories

| Repo | Remote | Trunk | Notes |
|------|--------|-------|-------|
| Backend / admin | `github.com/arielko/method26-admin` | `main` (== `admin-ui`) | Fork of `lukesbrave/digital-home-backend`, based on 2.7.4 + ~43 custom commits. CRM, social, the cron, R2 and the brand-playbooks API were removed. Now a photo-proofing + file-delivery admin. |
| Frontend / site | `github.com/arielko/method26` | `main` (== `gallery-parity`) | Custom Astro build, not the starter frontend. Own gallery DB migrations in `supabase/migrations/0001..0004`. Stale branch `phase-5-launch` can be deleted. |

`main` was fast-forwarded to the working branch on both repos on 2026-09-10 so
`main` means "current" again. No CI on either repo; deploys are manual.

## Version

- Backend `VERSION` file: **2.7.4**. Live version **unverified** — there is no
  health/version endpoint, so no commit is provably the deployed one.
- Latest official backend release: **2.8.0** (2026-09-07). Its only new feature
  is the optional social calendar, which this fork has already removed. No real gap.
- Frontend is a bespoke build with no starter lineage; no version to track.

## Database audit (2026-09-10, read-only)

Schema matches the repo migrations (gallery/drops + backend core). No CRM tables.

| Table | Rows |
|-------|------|
| galleries | 1 |
| collections | 1 |
| photos | 181 |
| folders | 2 |
| gallery_visitors | 1 |
| gallery_favorites | 12 |
| gallery_views | 8 |
| gallery_emails | 4 |
| gallery_downloads | 0 |
| file_drops / drop_files / drop_emails | 0 |

**Pulse:** one active client gallery (181 photos) in proofing — 1 visitor, 12
favorites, 8 views, 4 share emails sent, 0 downloads. "Send Files" delivery is
deployed but unused.

**Leads:** the contact form (`method26.com/contact`) does not write to the
database — it emails via Resend (`_Website/src/lib/mail.ts`) to `INQUIRY_TO`.

## Credentials / secrets (status only — never values here)

- Supabase: `NEXT_PUBLIC_SUPABASE_URL` / anon key committed in `wrangler.jsonc`
  (public by design). `SUPABASE_SERVICE_ROLE_KEY` and B2 keys in `_Admin/.env.local`
  (gitignored). Worker secrets on Cloudflare not inspected (no CF access).
- Frontend Worker secrets (`RESEND_API_KEY`, `INQUIRY_FROM`, `INQUIRY_TO`,
  `TURNSTILE_SECRET_KEY`, Supabase, B2): set on Cloudflare, not verified from here.
- GitHub: `gh` CLI authed as `arielko` (SSH; scopes `gist read:org repo` — no `workflow`).

## Done

- [x] 2026-09-10 — Pushed `gallery-parity` to GitHub (was local-only; `d837b24`).
- [x] 2026-09-10 — Fast-forwarded `main` to trunk on both repos.
- [x] 2026-09-10 — Read-only database audit + business pulse.
- [x] 2026-09-10 — Registered in the shared Digital Home registry.

## Next

- [ ] Verify the contact-form email path — send a real test inquiry through
      `method26.com/contact` and confirm it lands.
- [ ] Add a backend health/version endpoint so the deployed commit is provable.
- [ ] Decide whether to delete the now-redundant `admin-ui` / `gallery-parity`
      branches and the stale `phase-5-launch`.
- [ ] Commit these `PROGRESS.md` files (owner approval pending).
