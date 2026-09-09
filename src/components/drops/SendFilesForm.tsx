'use client';

import { useCallback, useRef, useState } from 'react';
import { Plus, X, Check, Copy, Send } from 'lucide-react';
import { uploadDropFiles, type DropUploadProgress } from '@/lib/drops/upload';

const EXPIRY_CHOICES = [
  { days: 3, label: '3 days' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: null, label: 'Never' },
] as const;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * One screen: add files, say who and what, send.
 *
 * Files upload as soon as they are chosen rather than on submit, so the
 * transfer is already in the bucket by the time the studio finishes typing —
 * on a multi-gigabyte set that is the difference between pressing Send and
 * waiting, and pressing Send and being done.
 */
export function SendFilesForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [files, setFiles] = useState<{ id: string; filename: string; file_size_bytes: number }[]>([]);
  const [progress, setProgress] = useState<DropUploadProgress | null>(null);

  const [recipients, setRecipients] = useState<string[]>([]);
  const [entry, setEntry] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | null>(7);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ url: string; count: number; failed: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  // The transfer row has to exist before the first file, because its id is
  // what every object key is derived from.
  const ensureDrop = useCallback(async (): Promise<string> => {
    if (dropId) return dropId;
    const response = await fetch('/api/drops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!response.ok) throw new Error(`Could not start the transfer (${response.status})`);
    const { drop } = (await response.json()) as { drop: { id: string } };
    setDropId(drop.id);
    return drop.id;
  }, [dropId]);

  async function addFiles(chosen: File[]) {
    if (chosen.length === 0) return;
    setError(null);
    setSent(null);
    try {
      const id = await ensureDrop();
      const result = await uploadDropFiles(id, chosen, setProgress);
      setFiles((current) => [
        ...current,
        ...result.succeeded.map((f) => ({ id: f.id, filename: f.filename, file_size_bytes: f.file_size_bytes })),
      ]);
      if (result.failed.length > 0) {
        setError(
          `${result.failed.length} file${result.failed.length === 1 ? '' : 's'} did not upload: ` +
            result.failed.map((f) => `${f.filename} (${f.error})`).join('; ')
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setProgress(null);
    }
  }

  function addEntry() {
    const email = entry.trim().toLowerCase();
    if (email.length === 0) return;
    setRecipients((c) => (c.includes(email) ? c : [...c, email]));
    setEntry('');
  }

  async function send() {
    setError(null);
    if (!dropId || files.length === 0) {
      setError('Add at least one file.');
      return;
    }
    const all = entry.trim() ? [...recipients, entry.trim().toLowerCase()] : recipients;
    if (all.length === 0) {
      setError('Add at least one recipient.');
      return;
    }
    setSending(true);
    try {
      // Title, message and expiry are written at send time, not at creation:
      // the studio types them while the files are already uploading.
      const patch = await fetch('/api/drops', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dropId, title, message, expiresInDays }),
      });
      if (!patch.ok) throw new Error(`Could not save the transfer (${patch.status})`);

      const response = await fetch(`/api/drops/${dropId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: all }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `Could not send (${response.status})`);
      }
      const results: { email: string; ok: boolean }[] = Array.isArray(data.results) ? data.results : [];
      setSent({
        url: data.url,
        count: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).map((r) => r.email),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSending(false);
    }
  }

  function startAnother() {
    setDropId(null);
    setFiles([]);
    setRecipients([]);
    setEntry('');
    setTitle('');
    setMessage('');
    setSent(null);
    setError(null);
  }

  const totalBytes = files.reduce((sum, f) => sum + f.file_size_bytes, 0);

  if (sent) {
    return (
      <div className="mx-auto max-w-lg border border-stone bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center bg-ink">
          <Check className="h-5 w-5 text-paper" aria-hidden />
        </div>
        <h2 className="text-[18px] font-semibold text-ink">Files sent</h2>
        <p className="mt-1 text-[13px] text-ink">
          {sent.count} recipient{sent.count === 1 ? '' : 's'} · {files.length} file
          {files.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
        </p>
        {sent.failed.length > 0 && (
          <p className="mt-2 text-[12px] text-ink">Did not reach: {sent.failed.join(', ')}</p>
        )}

        <div className="mt-6 flex items-center gap-2 border border-stone bg-paper p-2">
          <span className="flex-1 truncate text-left font-mono text-[11px] text-ink">{sent.url}</span>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(sent.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            title="Copy link"
            className="p-1.5 text-ink hover:bg-stone"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>

        <button
          type="button"
          onClick={startAnother}
          className="mt-6 bg-ink px-5 py-2.5 text-[12px] font-medium uppercase tracking-wide text-paper"
        >
          Send more files
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 border border-stone bg-white p-6">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={progress !== null}
        className="flex flex-col items-center gap-2 border border-dashed border-stone py-8 text-ink transition-colors hover:border-ink disabled:opacity-50"
      >
        <Plus className="h-5 w-5" aria-hidden />
        <span className="text-[13px]">{files.length === 0 ? 'Add files' : 'Add more files'}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        disabled={progress !== null}
        onChange={(event) => {
          // Copied out of the live list before the input is cleared — see the
          // note in PhotoUploader; clearing the input empties input.files.
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
        className="hidden"
      />

      {progress && (
        <div className="border border-stone p-2">
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-ink">
            <span className="truncate">{progress.filename}</span>
            <span className="shrink-0 font-mono">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress.batchPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
            className="mt-1.5 h-1 w-full bg-stone"
          >
            <div className="h-full bg-ink transition-[width] duration-150" style={{ width: `${progress.batchPercent}%` }} />
          </div>
        </div>
      )}

      {files.length > 0 && (
        <ul className="flex flex-col divide-y divide-stone border border-stone">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 truncate text-[13px] text-ink" title={file.filename}>
                {file.filename}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink/70">
                {formatBytes(file.file_size_bytes)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink">Email to</span>
        <div className="flex min-h-[42px] flex-wrap gap-2 border border-stone p-2">
          {recipients.map((email) => (
            <span key={email} className="inline-flex items-center gap-1 border border-stone bg-paper px-2 py-1 text-[12px] text-ink">
              {email}
              <button type="button" onClick={() => setRecipients((c) => c.filter((r) => r !== email))} aria-label={`Remove ${email}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addEntry();
              }
            }}
            onBlur={addEntry}
            placeholder={recipients.length === 0 ? 'name@example.com' : ''}
            className="min-w-[140px] flex-1 border-0 bg-transparent text-[14px] text-ink outline-none"
          />
        </div>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" className="w-full text-[14px]" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink">Message</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Optional" className="w-full resize-none text-[14px]" />
      </label>

      <label className="flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-wide text-ink">Link expires</span>
        <select
          value={expiresInDays === null ? 'never' : String(expiresInDays)}
          onChange={(e) => setExpiresInDays(e.target.value === 'never' ? null : Number(e.target.value))}
          className="text-[13px]"
        >
          {EXPIRY_CHOICES.map((choice) => (
            <option key={choice.label} value={choice.days === null ? 'never' : String(choice.days)}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="border border-stone bg-paper px-3 py-2 text-[12px] text-ink">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={send}
        disabled={sending || progress !== null || files.length === 0}
        className="inline-flex items-center justify-center gap-2 bg-ink px-6 py-3 text-[12px] font-medium uppercase tracking-wide text-paper disabled:opacity-40"
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        {sending ? 'Sending…' : 'Send files'}
      </button>
    </div>
  );
}
