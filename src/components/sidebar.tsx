'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  {
    href: '/gallery',
    label: 'Galleries',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 256 256" fill="currentColor">
        <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,56H216V96H40ZM40,200V112H216v88Z" />
      </svg>
    ),
  },
  {
    href: '/send',
    label: 'Send Files',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 256 256" fill="currentColor">
        <path d="M231.4,44.34s0,.1,0,.15l-58.2,191.94a15.88,15.88,0,0,1-14,11.51q-.69.06-1.38.06a15.86,15.86,0,0,1-14.42-9.15l-34.52-72.72a4,4,0,0,1,.78-4.54l57.19-57.19a8,8,0,0,0-11.31-11.31L98.34,150.27a4,4,0,0,1-4.54.78L21.22,116.61a16,16,0,0,1,2.31-29.8l191.94-58.2.15,0A16,16,0,0,1,231.4,44.34Z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('dh-sidebar') === 'collapsed');
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem('dh-sidebar', next ? 'collapsed' : 'expanded');
    } catch {}
  };

  // Don't show sidebar on login page
  if (pathname === '/login') return null;

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 border-r border-stone bg-paper flex flex-col py-4 transition-[width] duration-200`}
    >
      {/* Wordmark + collapse toggle */}
      <div className={`flex items-center px-3 mb-6 ${collapsed ? 'flex-col gap-3' : 'justify-between'}`}>
        {/* The mark, not a letter and a word. Plain <img> rather than
            next/image: these are static SVGs served straight from public/,
            and image optimisation has nothing to do for them. The lockup
            carries the wordmark, so no text sits beside it; collapsed, the
            disc alone is the mark. */}
        <Link href="/gallery" className="flex items-center px-1.5" title="method26">
          {collapsed ? (
            <img src="/logo-disc.svg" alt="method26" className="h-6 w-6 shrink-0" />
          ) : (
            <img src="/logo-lockup.svg" alt="method26" className="h-5 w-auto" />
          )}
        </Link>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-ink hover:bg-stone p-1.5 transition-colors"
        >
          {collapsed ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
              <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
              <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
            </svg>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              // isActive uses bg-ink (dark) with text-paper (light) — a
              // fixed, guaranteed-readable pair. The previous version used
              // bg-minimal-row (which flips to near-black under the old
              // dark-mode class) with text-[var(--color-ink)] (which never
              // changes) — dark text on a dark background. See the note in
              // layout.tsx.
              className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive ? 'bg-ink text-paper' : 'text-ink hover:bg-stone'
              }`}
            >
              {item.icon}
              {!collapsed && <span className="text-[14px] font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
