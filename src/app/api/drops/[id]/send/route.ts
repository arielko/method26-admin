import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { getDrop, listDropFiles, recordDropEmail } from '@/lib/drops/queries';
import { sendGalleryEmail } from '@/lib/gallery/mail';
import { normalizeRecipients, isValidRecipient } from '@/lib/gallery/send';
import { GALLERY_EMAIL_DEFAULTS } from '@/lib/gallery/email-templates';
import { dropUrl } from '@/lib/drops/url';

// Sends a transfer. Deliberately reuses the gallery's mail transport and
// template — a transfer email is the same object with different copy, and a
// second Resend client would be a second place for a From address to be wrong.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);

  const { id } = await params;

  let body: { recipients?: unknown; sendCopy?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.recipients) || body.recipients.some((r) => typeof r !== 'string')) {
    return NextResponse.json({ error: 'recipients must be an array of email addresses' }, { status: 400 });
  }

  const drop = await getDrop(id);
  if (!drop) return NextResponse.json({ error: 'transfer not found' }, { status: 404 });

  // A transfer with no files is a link to an empty page. Refused here rather
  // than delivered and explained afterwards.
  const files = await listDropFiles(id);
  if (files.length === 0) {
    return NextResponse.json({ error: 'Add at least one file before sending.' }, { status: 400 });
  }

  const recipients = normalizeRecipients(body.recipients as string[]);
  if (body.sendCopy === true && auth.mode === 'session' && auth.email) recipients.push(auth.email);
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'Add at least one recipient.' }, { status: 400 });
  }
  const invalid = recipients.filter((email) => !isValidRecipient(email));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Not a valid email address: ${invalid.join(', ')}` }, { status: 400 });
  }

  const subject = drop.title?.trim()
    ? `${drop.title.trim()} — method26`
    : GALLERY_EMAIL_DEFAULTS.files.subject;

  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const recipient of recipients) {
    let result;
    try {
      result = await sendGalleryEmail({
        to: recipient,
        galleryName: drop.title?.trim() || `${files.length} file${files.length === 1 ? '' : 's'}`,
        url: dropUrl(drop.token),
        message: drop.message ?? undefined,
        expiresAt: drop.expires_at,
        variant: 'files',
        subject,
      });
    } catch (caught) {
      // Thrown only when the mail provider itself is misconfigured — the same
      // failure for every recipient, so stop rather than log it once each.
      return NextResponse.json(
        { error: caught instanceof Error ? caught.message : 'Email is not configured' },
        { status: 500 }
      );
    }

    await recordDropEmail({
      drop_id: drop.id,
      recipient,
      subject,
      status: result.ok ? 'sent' : 'failed',
      provider_id: result.ok ? result.providerId || null : null,
      error: result.ok ? null : result.error,
    });
    results.push(result.ok ? { email: recipient, ok: true } : { email: recipient, ok: false, error: result.error });
  }

  return NextResponse.json({ ok: true, results, url: dropUrl(drop.token) });
}
