'use client';

import * as React from 'react';
import { MoonIcon, SunIcon } from './icons';

type ThemeMode = 'light' | 'dark';

function getCurrentTheme(): ThemeMode {
  if (typeof document === 'undefined') {
    return 'light';
  }

  const current = document.documentElement.dataset.theme;
  return current === 'dark' ? 'dark' : 'light';
}

export function ThemeToggle(): React.ReactElement {
  const [theme, setTheme] = React.useState<ThemeMode>('light');
  const isDark = theme === 'dark';

  React.useEffect(() => {
    setTheme(getCurrentTheme());
  }, []);

  const toggleTheme = React.useCallback(() => {
    const nextTheme = isDark ? 'light' : 'dark';

    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem('acme-los-theme', nextTheme);
    setTheme(nextTheme);
  }, [isDark]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={toggleTheme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] shadow-sm transition hover:border-[var(--brand)] hover:bg-[var(--surface-strong)] sm:h-10 sm:w-10"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-accent)] text-[var(--brand)] sm:h-7 sm:w-7"
      >
        {isDark ? (
          <MoonIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        ) : (
          <SunIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        )}
      </span>
    </button>
  );
}
