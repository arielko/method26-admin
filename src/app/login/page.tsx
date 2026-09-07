'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = '/gallery';
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-minimal-bg">
      <form onSubmit={handleLogin} className="w-full max-w-[360px] px-10">
        {/* Logo */}
        <div className="mb-16">
          {/* The registration disc from the site's own logo — the same mark a
              client sees on their gallery, so the studio's admin and the
              client's view are visibly one system. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="" width={32} height={32} className="mb-6" />
          <h1 className="text-base font-semibold text-[var(--color-ink)]">method26</h1>
        </div>

        {/* Email */}
        <div className="mb-6">
          <label htmlFor="email" className="block text-[13px] font-medium text-[var(--color-ink)] mb-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-minimal-row border border-minimal-border rounded-lg px-3 py-2.5 text-[14px] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-slate)] transition-colors"
          />
        </div>

        {/* Password */}
        <div className="mb-8">
          <label htmlFor="password" className="block text-[13px] font-medium text-[var(--color-ink)] mb-2">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-minimal-row border border-minimal-border rounded-lg px-3 py-2.5 text-[14px] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-slate)] transition-colors"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-[13px] mb-4">{error}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-[var(--color-ink)] text-[var(--color-paper)] text-[14px] font-semibold rounded-lg disabled:opacity-30 transition-opacity"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

      </form>
    </div>
  );
}
