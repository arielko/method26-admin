'use client';

import { useState } from 'react';
import { Plus, Copy, Check, ExternalLink, Send, Settings, Trash2 } from 'lucide-react';
import type { Gallery, Folder, Photo } from '@/lib/gallery/types';
import { GallerySettingsPanel } from './GallerySettingsPanel';
import { ShareGalleryPanel } from './ShareGalleryPanel';
import { galleryUrl } from '@/lib/gallery/site-url';

export function PublishPanel({
  collectionId,
  galleries,
  folders,
  photos,
  hidden,
  onChanged,
}: {
  collectionId: string;
  galleries: Gallery[];
  folders: Folder[];
  photos: Photo[];
  hidden: Record<string, string[]>;
  onChanged: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openSettingsId, setOpenSettingsId] = useState<string | null>(null);
  const [openSendId, setOpenSendId] = useState<string | null>(null);

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

  async function remove(galleryId: string) {
    if (!confirm('Delete this gallery link? Visitors will no longer be able to open it.')) return;
    setError(null);
    try {
      const response = await fetch(`/api/gallery/galleries/${galleryId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Could not delete the link (${response.status})`);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink">Published Galleries</h2>
        {!isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 border border-ink px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-ink hover:bg-ink hover:text-paper transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Gallery
          </button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={create} className="flex flex-wrap items-end gap-3 border border-stone bg-white p-4">
          <label className="flex flex-1 min-w-[200px] flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink">Gallery name</span>
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
            {busy ? 'Creating…' : 'Create gallery'}
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
          <p className="text-[14px] text-ink">No galleries published yet.</p>
          <p className="mt-1 text-[12px] text-ink">Create one to share this shoot with the client.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {galleries.map((gallery) => {
            const url = galleryUrl(gallery.token);
            const expired =
              gallery.expiration_date !== null && new Date(gallery.expiration_date) <= new Date();
            const hiddenHere = hidden[gallery.id] ?? [];
            const live = gallery.is_published && !expired;

            return (
              <li key={gallery.id} className="border border-stone bg-white">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      title={live ? 'Live' : 'Draft'}
                      className={`h-2 w-2 shrink-0 ${live ? 'bg-amber' : 'bg-stone'}`}
                    />
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-ink">{gallery.name}</h3>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-ink">{url}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => patch(gallery.id, { isPublished: !gallery.is_published })}
                      className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink hover:bg-paper transition-colors"
                      title={gallery.is_published ? 'Unpublish' : 'Publish'}
                    >
                      {gallery.is_published ? 'Live' : 'Draft'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(url);
                        setCopied(gallery.id);
                        setTimeout(() => setCopied((c) => (c === gallery.id ? null : c)), 2000);
                      }}
                      title="Copy link"
                      className="p-2 text-ink hover:bg-paper transition-colors"
                    >
                      {copied === gallery.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open"
                      className="p-2 text-ink hover:bg-paper transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenSendId((cur) => (cur === gallery.id ? null : gallery.id));
                        // Mutually exclusive: these two are separate pieces of
                        // state, so opening one while the other was open used
                        // to render both stacked under the same row, with the
                        // second appearing to swallow the first.
                        setOpenSettingsId(null);
                      }}
                      aria-expanded={openSendId === gallery.id}
                      title="Send via email"
                      className={`p-2 transition-colors ${openSendId === gallery.id ? 'bg-ink text-paper' : 'text-ink hover:bg-paper'}`}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenSettingsId((cur) => (cur === gallery.id ? null : gallery.id));
                        setOpenSendId(null);
                      }}
                      aria-expanded={openSettingsId === gallery.id}
                      title="Settings"
                      className={`p-2 transition-colors ${openSettingsId === gallery.id ? 'bg-ink text-paper' : 'text-ink hover:bg-paper'}`}
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(gallery.id)}
                      title="Delete gallery"
                      className="p-2 text-red-600 hover:bg-paper transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
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
                  <span>
                    {folders.length - hiddenHere.length}/{folders.length} folder
                    {folders.length === 1 ? '' : 's'} visible
                  </span>
                  <span>{gallery.downloads_enabled ? 'Downloads on' : 'Downloads off'}</span>
                  <span>{gallery.email_capture_enabled ? 'Email capture on' : 'Email capture off'}</span>
                </div>

                {openSendId === gallery.id && (
                  <ShareGalleryPanel gallery={gallery} onClose={() => setOpenSendId(null)} />
                )}

                {openSettingsId === gallery.id && (
                  <GallerySettingsPanel
                    gallery={gallery}
                    folders={folders}
                    photos={photos}
                    hidden={hiddenHere}
                    onPatch={(changes) => patch(gallery.id, changes)}
                    onSetVisibility={(folderId, isVisible) => setVisibility(gallery.id, folderId, isVisible)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
