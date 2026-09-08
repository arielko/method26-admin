import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/sidebar';
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'method26 — galleries',
  icons: { icon: '/favicon.svg' },
  description: 'The operating system for your digital presence.',
  robots: 'noindex, nofollow',
};

// method26 is a single fixed light palette (paper ground, ink text) — see
// the --color-ink/--color-paper/--color-stone/--color-amber/--color-slate
// block in globals.css. There is no dark variant of those tokens, but this
// dashboard was forked from a template with its own light/dark toggle that
// re-pointed a *different*, older set of tokens ("minimal-row",
// "minimal-muted") when the `dark` class was on <html> — and that class was
// applied by default. The result: a selected sidebar item rendered
// `bg-minimal-row` (near-black in dark mode) under `text-[var(--color-ink)]`
// (always near-black, no dark variant) — dark text on a dark background,
// unreadable. <html> now never carries `dark`, so every component is free
// to keep using the fixed ink/paper/stone tokens directly.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className={`${geist.variable} ${geistMono.variable} bg-paper text-ink font-sans h-screen w-screen overflow-hidden flex antialiased`}>
        <Sidebar />
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
