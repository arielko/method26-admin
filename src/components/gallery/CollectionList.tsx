'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Collection } from '@/lib/gallery/types';

export function CollectionList({ initial }: { initial: Collection[] }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/gallery/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(`Could not create the shoot (${response.status})`);
      setName('');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create}>
      <label>
        <span>New shoot</span>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </label>
      <button type="submit" disabled={busy || name.trim().length === 0}>create</button>
      {error && <p role="alert">{error}</p>}
      <span hidden>{initial.length}</span>
    </form>
  );
}
