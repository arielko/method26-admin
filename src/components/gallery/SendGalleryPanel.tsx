'use client';

import { useState } from 'react';
import type { Gallery } from '@/lib/gallery/types';

// The compose form behind the Send action on a gallery row. Replaces the
// old mailto: draft entirely — POST /api/gallery/galleries/[id]/send does
// the actual delivery through Resend and logs the attempt either way; see
// src/lib/gallery/send.ts. There is no fallback path left: a send either
// succeeds or reports the real error here.
export function SendGalleryPanel({ gallery, onClose }: { gallery: Gallery; onClose: () => void }) {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/gallery/galleries/${gallery.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: recipient.trim(),
          ...(message.trim() ? { message: message.trim() } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `Could not send (${response.status})`);
      }
      setSent(true);
      setRecipient('');
      setMessage('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSending(false);
    }
  }

  if (!gallery.is_published) {
    return (
      <div className="border-t border-stone bg-paper p-4">
        <p className="text-[13px] text-ink">
          This gallery isn&rsquo;t published — publish it first so the link doesn&rsquo;t 404 for the
          recipient.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 px-3 py-2 text-[12px] uppercase tracking-wide text-ink"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-stone bg-paper p-4">
      <form onSubmit={send} className="flex max-w-lg flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink">Recipient</span>
          <input
            type="email"
            required
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              setSent(false);
            }}
            disabled={sending}
            placeholder="client@example.com"
            className="w-full text-[14px]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink">Message (optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending}
            rows={3}
            placeholder="A line or two to add above the link…"
            className="w-full text-[14px]"
          />
        </label>

        {error && (
          <p role="alert" className="border border-stone bg-white px-3 py-2 text-[12px] text-ink">
            {error}
          </p>
        )}
        {sent && !error && (
          <p className="text-[12px] text-ink">
            Sent. Check the Emails Sent tab in Analytics for the delivery log.
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={sending || recipient.trim().length === 0}
            className="bg-ink px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-paper disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send gallery link'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-[12px] uppercase tracking-wide text-ink"
          >
            Close
          </button>
        </div>
      </form>
    </div>
  );
}
