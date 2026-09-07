'use client';

import { useState } from 'react';
import type { Gallery, Folder, Photo } from '@/lib/gallery/types';
import { PhotoThumb } from './PhotoThumb';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://method26.com';

type SettingsTab = 'general' | 'cover' | 'downloads' | 'access';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'cover', label: 'Cover' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'access', label: 'Access' },
];

// The full editor for one client link. The Publish view's row keeps a
// compact status/copy/publish strip; this is where every other setting on
// a gallery lives, tabbed the way the Argento reference does — General,
// Cover, Downloads, Access.
export function GallerySettingsPanel({
  gallery,
  folders,
  photos,
  hidden,
  onPatch,
  onSetVisibility,
}: {
  gallery: Gallery;
  folders: Folder[];
  photos: Photo[];
  hidden: string[];
  onPatch: (changes: Record<string, unknown>) => Promise<void>;
  onSetVisibility: (folderId: string, isVisible: boolean) => Promise<void>;
}) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [name, setName] = useState(gallery.name);
  const [savingName, setSavingName] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customExpiry, setCustomExpiry] = useState('');

  const url = `${SITE}/g/${gallery.token}/`;
  const nameDirty = name.trim().length > 0 && name.trim() !== gallery.name;

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === gallery.name) return;
    setSavingName(true);
    try {
      await onPatch({ name: trimmed });
    } finally {
      setSavingName(false);
    }
  }

  function applyCustomExpiry() {
    if (!customExpiry) return;
    const target = new Date(`${customExpiry}T23:59:59`);
    const days = Math.ceil((target.getTime() - Date.now()) / 86_400_000);
    if (days > 0) onPatch({ expiresInDays: days });
    setCustomExpiry('');
  }

  return (
    <div className="border-t border-stone bg-paper p-4">
      <nav className="flex gap-1 border border-stone bg-white p-1" aria-label="Link settings">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'true' : undefined}
            className={`px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors ${
              tab === t.id ? 'bg-ink text-paper' : 'text-ink hover:bg-stone'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'general' && (
        <div className="mt-4 flex flex-col gap-6">
          <form onSubmit={saveName} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-1 min-w-[200px] flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-ink">Link name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={savingName}
                className="w-full text-[14px]"
              />
            </label>
            <button
              type="submit"
              disabled={!nameDirty || savingName}
              className="bg-ink px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-paper disabled:opacity-40"
            >
              {savingName ? 'Saving…' : 'Save name'}
            </button>
          </form>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink">
              Folders this client sees ({folders.length - hidden.length}/{folders.length})
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {folders.map((folder) => {
                const isHidden = hidden.includes(folder.id);
                return (
                  <li key={folder.id}>
                    <label className="flex items-center gap-2 text-[12px] text-ink">
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={(e) => onSetVisibility(folder.id, e.target.checked)}
                      />
                      <span>{folder.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {tab === 'cover' && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-[12px] text-ink">
            Pick the photograph shown on this link&rsquo;s landing page.
          </p>
          {photos.length === 0 ? (
            <p className="text-[13px] text-ink">Upload photographs before choosing a cover.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {photos.map((photo) => {
                const isCover = gallery.cover_photo_id === photo.id;
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      onClick={() => onPatch({ coverPhotoId: isCover ? null : photo.id })}
                      aria-pressed={isCover}
                      className={`block aspect-square w-full overflow-hidden border ${
                        isCover ? 'border-ink' : 'border-stone hover:border-ink'
                      }`}
                      title={isCover ? 'Current cover — click to remove' : 'Set as cover'}
                    >
                      <PhotoThumb photoId={photo.id} alt={photo.filename} className="h-full w-full object-cover" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === 'downloads' && (
        <div className="mt-4 max-w-lg">
          <label className="flex items-start justify-between gap-4 border border-stone bg-white p-4">
            <span>
              <span className="block text-[14px] font-medium text-ink">Allow full-resolution downloads</span>
              <span className="mt-1 block text-[12px] text-ink">
                On, this puts the original full-resolution files on the proofing page itself — anyone with
                the link can save them, not just view proofs. It defaults off for that reason: turning it on
                is a decision about giving away originals, not a display preference.
              </span>
            </span>
            <input
              type="checkbox"
              checked={gallery.downloads_enabled}
              onChange={(e) => onPatch({ downloadsEnabled: e.target.checked })}
              className="mt-1 shrink-0"
            />
          </label>
        </div>
      )}

      {tab === 'access' && (
        <div className="mt-4 flex max-w-lg flex-col gap-4">
          <label className="flex items-start justify-between gap-4 border border-stone bg-white p-4">
            <span>
              <span className="block text-[14px] font-medium text-ink">Require name and email</span>
              <span className="mt-1 block text-[12px] text-ink">
                Visitors enter their name and email before viewing. Off by default — this is the proofing
                link, not a delivery gate.
              </span>
            </span>
            <input
              type="checkbox"
              checked={gallery.email_capture_enabled}
              onChange={(e) => onPatch({ emailCaptureEnabled: e.target.checked })}
              className="mt-1 shrink-0"
            />
          </label>

          <div className="border border-stone bg-white p-4">
            <p className="text-[11px] uppercase tracking-wide text-ink">Link</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="flex-1 min-w-[200px] text-[12px] text-ink">{url}</p>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="border border-stone px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink hover:border-ink transition-colors"
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={() => onPatch({ isPublished: !gallery.is_published })}
                className="border border-stone px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink hover:border-ink transition-colors"
              >
                {gallery.is_published ? 'Unpublish' : 'Publish'}
              </button>
            </div>
          </div>

          <div className="border border-stone bg-white p-4">
            <p className="text-[11px] uppercase tracking-wide text-ink">Expiry</p>
            <p className="mt-1 text-[12px] text-ink">
              {gallery.expiration_date
                ? `Expires ${new Date(gallery.expiration_date).toLocaleDateString()}`
                : 'No expiry — this link works indefinitely'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
              <button
                type="button"
                onClick={() => onPatch({ expiresInDays: 30 })}
                className="uppercase tracking-wide underline decoration-stone underline-offset-4 hover:decoration-ink"
              >
                Expire in 30 days
              </button>
              <button
                type="button"
                onClick={() => onPatch({ expiresInDays: 90 })}
                className="uppercase tracking-wide underline decoration-stone underline-offset-4 hover:decoration-ink"
              >
                Expire in 90 days
              </button>
              {gallery.expiration_date && (
                <button
                  type="button"
                  onClick={() => onPatch({ expiresInDays: null })}
                  className="uppercase tracking-wide underline decoration-stone underline-offset-4 hover:decoration-ink"
                >
                  Remove expiry
                </button>
              )}
              <span className="flex items-center gap-2">
                <input
                  type="date"
                  value={customExpiry}
                  onChange={(e) => setCustomExpiry(e.target.value)}
                  className="text-[12px]"
                />
                <button
                  type="button"
                  onClick={applyCustomExpiry}
                  disabled={!customExpiry}
                  className="uppercase tracking-wide underline decoration-stone underline-offset-4 hover:decoration-ink disabled:opacity-40"
                >
                  Set date
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
