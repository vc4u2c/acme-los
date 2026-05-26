import * as React from 'react';
import {
  THEME_COOKIE_MAX_AGE_SECONDS,
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  resolveThemeCookieDomain,
} from '../../lib/theme-preference';

export function ThemeScript(): React.ReactElement {
  const themeCookieDomain = resolveThemeCookieDomain();
  const script = `
    (function () {
      try {
        var root = document.documentElement;
        var storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
        var cookieName = ${JSON.stringify(THEME_COOKIE_NAME)};
        var cookieDomain = ${JSON.stringify(themeCookieDomain)};
        var maxAge = ${THEME_COOKIE_MAX_AGE_SECONDS};
        var readCookie = function () {
          var entries = document.cookie.split(';');
          for (var index = 0; index < entries.length; index += 1) {
            var entry = entries[index].trim();
            if (entry.indexOf(cookieName + '=') !== 0) continue;
            var value = decodeURIComponent(entry.slice(cookieName.length + 1));
            return value === 'dark' || value === 'light' ? value : null;
          }
          return null;
        };
        var canShare = cookieDomain && (
          window.location.hostname === cookieDomain ||
          window.location.hostname.endsWith('.' + cookieDomain)
        );
        var cookie = readCookie();
        var stored = window.localStorage.getItem(storageKey);
        var preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        var theme = cookie || (stored === 'dark' || stored === 'light' ? stored : preferred);
        root.dataset.theme = theme;
        window.localStorage.setItem(storageKey, theme);
        document.cookie = cookieName + '=' + theme + '; Max-Age=' + maxAge + '; Path=/; SameSite=Lax' +
          (window.location.protocol === 'https:' ? '; Secure' : '') +
          (canShare ? '; Domain=' + cookieDomain : '');
      } catch (error) {
        document.documentElement.dataset.theme = 'light';
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
