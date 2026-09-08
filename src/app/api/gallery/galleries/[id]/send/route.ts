import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { getGallery, recordGalleryEmail } from '@/lib/gallery/queries';
import { sendGalleryEmail } from '@/lib/gallery/mail';
import { sendGalleryLink } from '@/lib/gallery/send';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://method26.com';

// Sends a client the gallery link by email and logs the attempt either
// way — see src/lib/gallery/send.ts, which holds the actual refusal and
// logging logic so it can be unit tested without a live request/response
// or a live Supabase/Resend. This route is a thin adapter over it.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const { id } = await params;

  let body: { recipient?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.recipient !== 'string' || body.recipient.trim().length === 0) {
    return NextResponse.json({ error: 'recipient is required' }, { status: 400 });
  }
  if (body.message !== undefined && typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message must be a string' }, { status: 400 });
  }

  // The gallery is resolved server-side from the id in the URL — never
  // taken from the request body — same as every other route here.
  const gallery = await getGallery(id);
  if (!gallery) return NextResponse.json({ error: 'gallery not found' }, { status: 404 });

  const url = `${SITE}/g/${gallery.token}/`;

  let result;
  try {
    result = await sendGalleryLink(gallery, url, body.recipient, body.message, {
      send: sendGalleryEmail,
      record: recordGalleryEmail,
    });
  } catch (caught) {
    // sendGalleryEmail throws (rather than returning a result) only when
    // the mail provider itself isn't configured — a deploy problem, not a
    // per-request one. Reported as the generic "not configured" shape a
    // caller can act on without learning anything about the recipient.
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : 'Gallery email is not configured' },
      { status: 500 }
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
