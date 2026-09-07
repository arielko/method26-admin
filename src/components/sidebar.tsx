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
];

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(!document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle('dark', !next);
    try {
      localStorage.setItem('dh-theme', next ? 'light' : 'dark');
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-minimal-muted hover:text-[var(--color-ink)] hover:bg-minimal-row transition-colors w-full ${
        collapsed ? 'justify-center' : ''
      }`}
    >
      {light ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 256 256" fill="currentColor">
          <path d="M233.54,142.23a8,8,0,0,0-8-2,88.08,88.08,0,0,1-109.8-109.8,8,8,0,0,0-10-10,104.84,104.84,0,0,0-52.91,37A104,104,0,0,0,136,224a103.09,103.09,0,0,0,62.52-20.88,104.84,104.84,0,0,0,37-52.91A8,8,0,0,0,233.54,142.23ZM188.9,190.34A88,88,0,0,1,65.66,67.11a89,89,0,0,1,31.4-26A106,106,0,0,0,96,56,104.11,104.11,0,0,0,200,160a106,106,0,0,0,14.92-1.06A89,89,0,0,1,188.9,190.34Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 256 256" fill="currentColor">
          <path d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z" />
        </svg>
      )}
      {!collapsed && <span className="text-[14px] font-medium">{light ? 'Dark mode' : 'Light mode'}</span>}
    </button>
  );
}

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
      className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 border-r border-minimal-border flex flex-col py-4 transition-[width] duration-200`}
    >
      {/* Wordmark + collapse toggle */}
      <div className={`flex items-center px-3 mb-6 ${collapsed ? 'flex-col gap-3' : 'justify-between'}`}>
        <Link href="/gallery" className="flex items-center gap-2.5 px-1.5" title="method26">
          <span className="w-6 h-6 rounded-md bg-[var(--color-ink)] text-[var(--color-paper)] text-[11px] font-bold flex items-center justify-center shrink-0">
            B
          </span>
          {!collapsed && <span className="text-[14px] font-semibold text-[var(--color-ink)]">method26</span>}
        </Link>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-minimal-muted hover:text-[var(--color-ink)] p-1.5 rounded-md hover:bg-minimal-row transition-colors"
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
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-minimal-row text-[var(--color-ink)]'
                  : 'text-minimal-muted hover:text-[var(--color-ink)] hover:bg-minimal-row'
              }`}
            >
              {item.icon}
              {!collapsed && <span className="text-[14px] font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Theme */}
      <div className="px-3 flex flex-col gap-1">
        <ThemeToggle collapsed={collapsed} />
      </div>
    </aside>
  );
}
