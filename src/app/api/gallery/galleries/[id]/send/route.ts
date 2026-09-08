import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import {
  getGallery,
  recordGalleryEmail,
  listGalleryEmails,
  listVisitorsWithActivity,
} from '@/lib/gallery/queries';
import { sendGalleryEmail } from '@/lib/gallery/mail';
import { sendGalleryLinks } from '@/lib/gallery/send';
import { galleryUrl } from '@/lib/gallery/site-url';
import type { GalleryEmailVariant } from '@/lib/gallery/email-templates';

// Sends a gallery link to one or more clients and logs every attempt — see
// src/lib/gallery/send.ts, which holds the refusal, deduplication and
// logging logic so it can be unit tested without a live request, Supabase or
// Resend. This route is a thin adapter over it.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const { id } = await params;

  let body: {
    recipients?: unknown;
    recipient?: unknown;
    subject?: unknown;
    message?: unknown;
    variant?: unknown;
    sendCopy?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // `recipient` (singular) is still accepted so an older client, or a
  // half-refreshed tab, does not silently send nothing.
  const raw = Array.isArray(body.recipients)
    ? body.recipients
    : typeof body.recipient === 'string'
      ? [body.recipient]
      : null;
  if (raw === null || raw.some((entry) => typeof entry !== 'string')) {
    return NextResponse.json({ error: 'recipients must be an array of email addresses' }, { status: 400 });
  }
  for (const field of ['subject', 'message'] as const) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      return NextResponse.json({ error: `${field} must be a string` }, { status: 400 });
    }
  }
  if (body.variant !== undefined && body.variant !== 'proofing' && body.variant !== 'finals') {
    return NextResponse.json({ error: 'variant must be proofing or finals' }, { status: 400 });
  }

  // The gallery is resolved server-side from the id in the URL — never taken
  // from the request body — same as every other route here.
  const gallery = await getGallery(id);
  if (!gallery) return NextResponse.json({ error: 'gallery not found' }, { status: 404 });

  const recipients = (raw as string[]).slice();
  // "Send me a copy" addresses the signed-in studio account, read from the
  // session rather than the request, so a caller cannot use it to add an
  // arbitrary extra recipient.
  if (body.sendCopy === true && auth.mode === 'session' && auth.email) recipients.push(auth.email);

  let result;
  try {
    result = await sendGalleryLinks(
      gallery,
      galleryUrl(gallery.token),
      {
        recipients,
        subject: typeof body.subject === 'string' ? body.subject : undefined,
        message: typeof body.message === 'string' ? body.message : undefined,
        variant: body.variant as GalleryEmailVariant | undefined,
      },
      { send: sendGalleryEmail, record: recordGalleryEmail }
    );
  } catch (caught) {
    // sendGalleryEmail throws (rather than returning a result) only when the
    // mail provider itself isn't configured — a deploy problem, not a
    // per-request one.
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : 'Gallery email is not configured' },
      { status: 500 }
    );
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, results: result.results });
}

// Addresses this gallery has already been in touch with — everyone who has
// opened it and everyone it has been sent to — offered in the share screen as
// one-click chips. Read-only, and scoped to the one gallery in the URL.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const { id } = await params;
  const gallery = await getGallery(id);
  if (!gallery) return NextResponse.json({ error: 'gallery not found' }, { status: 404 });

  const [visitors, emails] = await Promise.all([
    listVisitorsWithActivity(id),
    listGalleryEmails(id),
  ]);

  const suggestions = [
    ...new Set(
      [...visitors.map((v) => v.email), ...emails.map((e) => e.recipient)]
        .map((email) => (email ?? '').trim().toLowerCase())
        .filter((email) => email.includes('@'))
    ),
  ];

  return NextResponse.json({ suggestions });
}
