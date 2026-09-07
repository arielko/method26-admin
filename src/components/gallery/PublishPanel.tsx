'use client';

import { useState } from 'react';
import type { Gallery, Folder } from '@/lib/gallery/types';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://method26.com';

export function PublishPanel({
  collectionId,
  galleries,
  folders,
  hidden,
  onChanged,
}: {
  collectionId: string;
  galleries: Gallery[];
  folders: Folder[];
  hidden: Record<string, string[]>;
  onChanged: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/gallery/galleries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId, name: trimmed }),
      });
      if (!response.ok) throw new Error(`Could not create the link (${response.status})`);
      setName('');
      setIsCreating(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, changes: Record<string, unknown>) {
    setError(null);
    try {
      const response = await fetch(`/api/gallery/galleries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!response.ok) throw new Error(`Could not update the link (${response.status})`);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function setVisibility(galleryId: string, folderId: string, isVisible: boolean) {
    setError(null);
    try {
      const response = await fetch('/api/gallery/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ galleryId, folderId, isVisible }),
      });
      if (!response.ok) throw new Error(`Could not change visibility (${response.status})`);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-ink">Client links</h2>
        {!isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="border border-ink px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-ink hover:bg-ink hover:text-paper transition-colors"
          >
            + New link
          </button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={create} className="flex flex-wrap items-end gap-3 border border-stone bg-white p-4">
          <label className="flex flex-1 min-w-[200px] flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink">Link name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="e.g. Whitfield family"
              className="w-full text-[14px]"
            />
          </label>
          <button
            type="submit"
            disabled={busy || name.trim().length === 0}
            className="bg-ink px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-paper disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create link'}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setName('');
            }}
            className="px-3 py-2 text-[12px] uppercase tracking-wide text-ink"
          >
            Cancel
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="border border-stone bg-white px-4 py-3 text-[13px] text-ink">
          {error}
        </p>
      )}

      {galleries.length === 0 ? (
        <div className="border border-dashed border-stone py-16 text-center">
          <p className="text-[14px] text-ink">No client links yet.</p>
          <p className="mt-1 text-[12px] text-ink">Create one to share this shoot.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {galleries.map((gallery) => {
            const url = `${SITE}/g/${gallery.token}/`;
            const expired =
              gallery.expiration_date !== null && new Date(gallery.expiration_date) <= new Date();
            const hiddenHere = hidden[gallery.id] ?? [];

            return (
              <li key={gallery.id} className="border border-stone bg-white">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`h-2 w-2 shrink-0 ${
                        gallery.is_published && !expired ? 'bg-amber' : 'bg-stone'
                      }`}
                    />
                    <div>
                      <h3 className="text-[14px] font-semibold text-ink">{gallery.name}</h3>
                      <p className="mt-0.5 text-[11px] text-ink">{url}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(url);
                        setCopied(gallery.id);
                        setTimeout(() => setCopied((c) => (c === gallery.id ? null : c)), 2000);
                      }}
                      className="border border-stone px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink hover:border-ink transition-colors"
                    >
                      {copied === gallery.id ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => patch(gallery.id, { isPublished: !gallery.is_published })}
                      className="border border-stone px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink hover:border-ink transition-colors"
                    >
                      {gallery.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 border-t border-stone px-4 py-3 text-[11px] text-ink">
                  <span>
                    {!gallery.is_published
                      ? 'Not published — the link 404s'
                      : expired
                        ? 'Expired'
                        : gallery.expiration_date
                          ? `Expires ${new Date(gallery.expiration_date).toLocaleDateString()}`
                          : 'No expiry — this link works indefinitely'}
                  </span>
                  <button
                    type="button"
                    onClick={() => patch(gallery.id, { expiresInDays: 30 })}
                    className="uppercase tracking-wide underline decoration-stone underline-offset-4 hover:decoration-ink"
                  >
                    Expire in 30 days
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(gallery.id, { expiresInDays: 90 })}
                    className="uppercase tracking-wide underline decoration-stone underline-offset-4 hover:decoration-ink"
                  >
                    Expire in 90 days
                  </button>
                  {gallery.expiration_date && (
                    <button
                      type="button"
                      onClick={() => patch(gallery.id, { expiresInDays: null })}
                      className="uppercase tracking-wide underline decoration-stone underline-offset-4 hover:decoration-ink"
                    >
                      Remove expiry
                    </button>
                  )}
                </div>

                <details className="border-t border-stone px-4 py-3">
                  <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-ink">
                    Folders this client sees ({folders.length - hiddenHere.length}/{folders.length})
                  </summary>
                  <ul className="mt-3 flex flex-col gap-2">
                    {folders.map((folder) => {
                      const isHidden = hiddenHere.includes(folder.id);
                      return (
                        <li key={folder.id}>
                          <label className="flex items-center gap-2 text-[12px] text-ink">
                            <input
                              type="checkbox"
                              checked={!isHidden}
                              onChange={(e) => setVisibility(gallery.id, folder.id, e.target.checked)}
                            />
                            <span>{folder.name}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
