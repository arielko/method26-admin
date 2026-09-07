'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Gallery } from '@/lib/gallery/types';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://method26.com';

export function GalleryPanel({
  collectionId,
  galleries,
}: {
  collectionId: string;
  galleries: Gallery[];
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const router = useRouter();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch('/api/gallery/galleries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectionId, name }),
    });
    if (!response.ok) {
      setError(`Could not create the link (${response.status})`);
      return;
    }
    setName('');
    router.refresh();
  }

  async function patch(id: string, changes: Record<string, unknown>) {
    setError(null);
    const response = await fetch(`/api/gallery/galleries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!response.ok) {
      setError(`Could not update the link (${response.status})`);
      return;
    }
    router.refresh();
  }

  return (
    <section>
      <h2>Client links</h2>

      <form onSubmit={create}>
        <label>
          <span>New link</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" disabled={name.trim().length === 0}>create link</button>
      </form>

      {error && <p role="alert">{error}</p>}

      {galleries.map((gallery) => {
        const url = `${SITE}/g/${gallery.token}/`;
        const expired =
          gallery.expiration_date !== null && new Date(gallery.expiration_date) <= new Date();
        return (
          <article key={gallery.id}>
            <h3>{gallery.name}</h3>

            {/* The link IS the credential — anyone holding it sees the work. */}
            <p><code>{url}</code></p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(gallery.id);
              }}
            >
              {copied === gallery.id ? 'copied' : 'copy link'}
            </button>

            <p>
              {gallery.is_published ? 'published' : 'not published — the link 404s'}
              {expired ? ' · expired' : ''}
              {gallery.expiration_date && !expired
                ? ` · expires ${new Date(gallery.expiration_date).toLocaleDateString()}`
                : ''}
              {!gallery.expiration_date ? ' · no expiry — this link works forever' : ''}
            </p>

            <button type="button" onClick={() => patch(gallery.id, { isPublished: !gallery.is_published })}>
              {gallery.is_published ? 'unpublish' : 'publish'}
            </button>
            <button type="button" onClick={() => patch(gallery.id, { expiresInDays: 30 })}>
              expire in 30 days
            </button>
            <button type="button" onClick={() => patch(gallery.id, { expiresInDays: null })}>
              remove expiry
            </button>
          </article>
        );
      })}
    </section>
  );
}
