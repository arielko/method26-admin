import { NextRequest, NextResponse } from 'next/server';
import { listDropsNeedingReminder, markReminderSent, recordDropEmail } from '@/lib/drops/queries';
import { sendGalleryEmail } from '@/lib/gallery/mail';
import { GALLERY_EMAIL_DEFAULTS } from '@/lib/gallery/email-templates';
import { dropUrl } from '@/lib/drops/url';
import { authenticateMachine } from '@/lib/api/machine-auth';

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
 * session, so it is the one route where a wrong guess mails clients. Its
 * guard lives in machine-auth, shared with the backup route.
 */
export async function POST(request: NextRequest) {
  const auth = authenticateMachine(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
