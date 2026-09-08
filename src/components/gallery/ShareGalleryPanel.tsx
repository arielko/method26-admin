'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, X } from 'lucide-react';
import type { Gallery } from '@/lib/gallery/types';
import {
  GALLERY_EMAIL_DEFAULTS,
  type GalleryEmailVariant,
} from '@/lib/gallery/email-templates';

const VARIANTS: GalleryEmailVariant[] = ['proofing', 'finals'];

// The share screen behind a gallery's Send action: pick a template, choose
// recipients, edit the subject and message, and see the email you are about
// to send.
//
// The preview is rendered by the server from the same builder the send uses
// (POST ../preview), not reconstructed here. A hand-built preview is the
// thing that drifts: it keeps looking right long after the template has
// changed, and the studio finds out from a client.
export function ShareGalleryPanel({
  gallery,
  onClose,
}: {
  gallery: Gallery;
  onClose: () => void;
}) {
  const [variant, setVariant] = useState<GalleryEmailVariant>(
    gallery.downloads_enabled ? 'finals' : 'proofing'
  );
  const [recipients, setRecipients] = useState<string[]>([]);
  const [entry, setEntry] = useState('');
  const [subject, setSubject] = useState(
    GALLERY_EMAIL_DEFAULTS[gallery.downloads_enabled ? 'finals' : 'proofing'].subject
  );
  const [message, setMessage] = useState(
    GALLERY_EMAIL_DEFAULTS[gallery.downloads_enabled ? 'finals' : 'proofing'].body
  );
  const [sendCopy, setSendCopy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [preview, setPreview] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ sent: number; total: number; failed: string[] } | null>(null);

  // Addresses this gallery has already been in touch with.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/gallery/galleries/${gallery.id}/send`)
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((data) => {
        if (!cancelled && Array.isArray(data.suggestions)) setSuggestions(data.suggestions);
      })
      .catch(() => {
        // Suggestions are a convenience; the address box works without them.
      });
    return () => {
      cancelled = true;
    };
  }, [gallery.id]);

  // Re-render the preview as the studio types, but only after they pause —
  // one request per keystroke would be a request per keystroke.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/gallery/galleries/${gallery.id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant, message }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && typeof data.html === 'string') setPreview(data.html);
        })
        .catch(() => {
          // Leaves the last good preview on screen rather than blanking it.
        });
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [gallery.id, variant, message]);

  const addEntry = useCallback(() => {
    const email = entry.trim().toLowerCase();
    if (email.length === 0) return;
    setRecipients((current) => (current.includes(email) ? current : [...current, email]));
    setEntry('');
  }, [entry]);

  function chooseVariant(next: GalleryEmailVariant) {
    setVariant(next);
    setSubject(GALLERY_EMAIL_DEFAULTS[next].subject);
    setMessage(GALLERY_EMAIL_DEFAULTS[next].body);
    setSummary(null);
  }

  async function send() {
    if (recipients.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/gallery/galleries/${gallery.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, subject, message, variant, sendCopy }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `Could not send (${response.status})`);
      }
      const results: { email: string; ok: boolean }[] = Array.isArray(data.results) ? data.results : [];
      const failed = results.filter((r) => !r.ok).map((r) => r.email);
      setSummary({ sent: results.length - failed.length, total: results.length, failed });
      if (failed.length === 0) setRecipients([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSending(false);
    }
  }

  if (!gallery.is_published) {
    return (
      <div className="border-t border-stone bg-paper p-6">
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

  const unused = suggestions.filter((s) => !recipients.includes(s));

  return (
    <div className="border-t border-stone bg-paper p-6">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="text-ink hover:bg-stone p-1 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h3 className="text-[13px] font-medium uppercase tracking-wide text-ink">Share Gallery</h3>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        {VARIANTS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => chooseVariant(id)}
            aria-pressed={variant === id}
            className={`px-4 py-2 text-[12px] font-medium uppercase tracking-wide transition-colors ${
              variant === id
                ? 'bg-ink text-paper'
                : 'border border-stone bg-white text-ink hover:bg-stone'
            }`}
          >
            {GALLERY_EMAIL_DEFAULTS[id].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="share-recipients"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-ink"
            >
              Recipients
            </label>
            {unused.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {unused.map((email) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => setRecipients((c) => [...c, email])}
                    title="Add recipient"
                    className="border border-stone bg-white px-2 py-1 text-[11px] text-ink hover:bg-stone transition-colors"
                  >
                    + {email}
                  </button>
                ))}
              </div>
            )}
            <div className="flex min-h-[42px] flex-wrap gap-2 border border-stone bg-white p-2">
              {recipients.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 border border-stone bg-paper px-2 py-1 text-[12px] text-ink"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => setRecipients((c) => c.filter((r) => r !== email))}
                    aria-label={`Remove ${email}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                id="share-recipients"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addEntry();
                  }
                }}
                onBlur={addEntry}
                placeholder={recipients.length === 0 ? 'Add email addresses…' : ''}
                className="min-w-[140px] flex-1 border-0 bg-transparent text-[14px] text-ink outline-none"
              />
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full text-[14px]"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full resize-none text-[14px]"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-3 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={sendCopy}
              onChange={(e) => setSendCopy(e.target.checked)}
            />
            Send me a copy
          </label>

          {error && (
            <p role="alert" className="border border-stone bg-white px-3 py-2 text-[12px] text-ink">
              {error}
            </p>
          )}

          {summary && !error && (
            <div className="border border-stone bg-white px-3 py-2 text-[12px] text-ink">
              <p>
                Sent to {summary.sent} of {summary.total} recipient{summary.total === 1 ? '' : 's'}.
              </p>
              {summary.failed.length > 0 && (
                <p className="mt-1">Did not reach: {summary.failed.join(', ')}</p>
              )}
              <p className="mt-1">The delivery log is in Analytics → Emails sent.</p>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={send}
              disabled={sending || recipients.length === 0}
              className="inline-flex items-center gap-2 bg-ink px-6 py-2.5 text-[12px] font-medium uppercase tracking-wide text-paper transition-colors disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink">Email preview</p>
          <div className="border border-stone bg-white">
            {preview ? (
              <iframe
                title="Email preview"
                // Sandboxed with no allow-scripts and no allow-same-origin: this
                // document is built from studio-typed copy and a gallery name,
                // both escaped by the template, and it still has no reason to
                // run anything or to reach this origin.
                sandbox=""
                srcDoc={preview}
                className="h-[620px] w-full border-0"
              />
            ) : (
              <p className="p-6 text-[12px] text-ink">Rendering the email…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
