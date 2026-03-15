import * as React from 'react';

export function ThemeScript(): React.ReactElement {
  const script = `
    (function () {
      try {
        var root = document.documentElement;
        var stored = window.localStorage.getItem('acme-los-theme');
        var preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.dataset.theme = stored || preferred;
      } catch (error) {
        document.documentElement.dataset.theme = 'light';
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
