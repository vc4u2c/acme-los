'use client';

import * as React from 'react';
import { MoonIcon, SunIcon } from './icons';
import {
  createThemeCookie,
  resolveThemeCookieDomain,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from '../../lib/theme-preference';

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
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    document.cookie = createThemeCookie(nextTheme, {
      hostname: window.location.hostname,
      secure: window.location.protocol === 'https:',
      cookieDomain: resolveThemeCookieDomain(),
    });
    setTheme(nextTheme);
  }, [isDark]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={toggleTheme}
      className="inline-flex h-9 w-9 appearance-none items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--surface)/0.92] shadow-[0_10px_22px_var(--shadow-soft)] outline-none transition duration-150 hover:border-[var(--brand)] hover:bg-[var(--surface)] hover:shadow-[0_0_0_1px_var(--brand),0_10px_22px_var(--shadow-soft)] focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--background)] sm:h-10 sm:w-10 lg:h-11 lg:w-11 [-webkit-tap-highlight-color:transparent]"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--brand)] shadow-sm sm:h-7 sm:w-7 lg:h-8 lg:w-8"
      >
        {isDark ? (
          <MoonIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-[18px] lg:w-[18px]" />
        ) : (
          <SunIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-[18px] lg:w-[18px]" />
        )}
      </span>
    </button>
  );
}
