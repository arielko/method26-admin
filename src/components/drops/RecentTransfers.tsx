'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, ExternalLink, Trash2, Download } from 'lucide-react';

type Row = {
  id: string;
  token: string;
  title: string | null;
  created_at: string;
  expires_at: string | null;
  fileCount: number;
  collectors: number;
  lastDownloadAt: string | null;
};

const SITE = process.env.NEXT_PUBLIC_SITE_URL as string;

/**
 * What has been sent, so the link can be found again without re-sending.
 * A transfer is a thing somebody may ask about a week later — "can you send
 * that again" is answered by copying a link, not by uploading twice.
 */
export function RecentTransfers({ drops }: { drops: Row[] }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string, title: string | null, fileCount: number) {
    const name = title?.trim() || `${fileCount} file${fileCount === 1 ? '' : 's'}`;
    if (
      !confirm(
        `Delete the transfer "${name}"?\n\n` +
          `The link stops working immediately for anyone who has it. This cannot be undone.`
      )
    )
      return;
    setBusy(id);
    try {
      const response = await fetch('/api/drops', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (response.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="mt-4 flex flex-col divide-y divide-stone border border-stone bg-white">
      {drops.map((drop) => {
        const url = `${SITE}/f/${drop.token}`;
        const expired = drop.expires_at !== null && new Date(drop.expires_at) <= new Date();
        return (
          <li key={drop.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-ink">
                {drop.title?.trim() || `${drop.fileCount} file${drop.fileCount === 1 ? '' : 's'}`}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-ink/70">
                {new Date(drop.created_at).toLocaleDateString()} · {drop.fileCount} file
                {drop.fileCount === 1 ? '' : 's'} ·{' '}
                {expired
                  ? 'expired'
                  : drop.expires_at
                    ? `expires ${new Date(drop.expires_at).toLocaleDateString()}`
                    : 'no expiry'}
              </p>
              {/*
                The question this page exists to answer between sending and
                hearing back. Green when somebody has it, plain grey when
                nobody has — not red, because "not yet collected" on a
                transfer sent this morning is the normal state, not a fault.
              */}
              <p
                className={`mt-0.5 flex items-center gap-1.5 font-mono text-[11px] ${
                  drop.collectors > 0 ? 'text-green-700' : 'text-ink/50'
                }`}
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                {drop.collectors === 0
                  ? 'Not downloaded yet'
                  : `Downloaded by ${drop.collectors} ${drop.collectors === 1 ? 'person' : 'people'}` +
                    (drop.lastDownloadAt
                      ? ` · last ${new Date(drop.lastDownloadAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`
                      : '')}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(drop.id);
                  setTimeout(() => setCopied((c) => (c === drop.id ? null : c)), 2000);
                }}
                title="Copy link"
                className="p-2 text-ink hover:bg-paper"
              >
                {copied === drop.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
              <a href={url} target="_blank" rel="noopener noreferrer" title="Open" className="p-2 text-ink hover:bg-paper">
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => remove(drop.id, drop.title, drop.fileCount)}
                disabled={busy === drop.id}
                title="Delete transfer"
                className="p-2 text-red-600 hover:bg-paper disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
