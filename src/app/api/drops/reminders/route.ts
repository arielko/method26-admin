import { NextRequest, NextResponse } from 'next/server';
import { listDropsNeedingReminder, markReminderSent, recordDropEmail } from '@/lib/drops/queries';
import { sendGalleryEmail } from '@/lib/gallery/mail';
import { GALLERY_EMAIL_DEFAULTS } from '@/lib/gallery/email-templates';
import { dropUrl } from '@/lib/drops/url';

export const dynamic = 'force-dynamic';

/**
 * Reminds recipients about a transfer they never collected, the day before
 * its link dies.
 *
 * Driven by the daily keepalive Worker rather than by a cron on this Worker:
 * OpenNext owns this Worker's entry point, so a `scheduled` handler here
 * would have to survive its bundling. The keepalive already wakes up every
 * morning for Supabase and is plain Worker code.
 *
 * This is the one route in the admin that sends mail without a logged-in
 * session, so it is the one route where a wrong guess mails clients. Hence
 * the shared secret, and hence the refusal to run at all when the secret is
 * unset — an unset secret must never degrade into an open endpoint.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.REMINDER_SECRET;
  if (!expected) {
    console.error('reminders: REMINDER_SECRET is unset');
    return NextResponse.json({ error: 'Reminders are not configured' }, { status: 503 });
  }
  const presented = request.headers.get('x-reminder-secret') ?? '';
  if (!timingSafeEqual(presented, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const due = await listDropsNeedingReminder();
  const sent: { token: string; recipients: number }[] = [];

  for (const drop of due) {
    const name = drop.title?.trim() || `${drop.fileCount} file${drop.fileCount === 1 ? '' : 's'}`;
    const subject = drop.title?.trim()
      ? `${drop.title.trim()} — expires tomorrow`
      : GALLERY_EMAIL_DEFAULTS.filesReminder.subject;

    for (const recipient of drop.recipients) {
      let result;
      try {
        result = await sendGalleryEmail({
          to: recipient,
          galleryName: name,
          url: dropUrl(drop.token),
          // The original note is deliberately not repeated. It was written to
          // accompany a delivery ("here's the artwork, let me know") and reads
          // oddly attached to a reminder.
          expiresAt: drop.expires_at,
          variant: 'filesReminder',
          subject,
        });
      } catch (caught) {
        // Mail is misconfigured — the same failure for every recipient of
        // every transfer. Stop, and leave reminder_sent_at unset so tomorrow's
        // run picks these up once the configuration is fixed.
        console.error('reminders: mail transport failed', caught);
        return NextResponse.json({ error: 'Email is not configured', sent }, { status: 500 });
      }

      await recordDropEmail({
        drop_id: drop.id,
        recipient,
        subject,
        status: result.ok ? 'sent' : 'failed',
        provider_id: result.ok ? result.providerId || null : null,
        error: result.ok ? null : result.error,
      });
    }

    await markReminderSent(drop.id);
    sent.push({ token: drop.token.slice(0, 8), recipients: drop.recipients.length });
  }

  return NextResponse.json({ ok: true, reminded: sent.length, sent });
}

/**
 * Compares without leaking, through timing, how much of the secret is right.
 *
 * Length is compared first and the loop still runs over a fixed buffer, so a
 * wrong-length guess costs the same as a wrong-value one.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
