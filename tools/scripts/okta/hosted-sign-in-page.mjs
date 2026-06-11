import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const hostedPageTemplateDirectory = path.join(scriptDirectory, 'templates');
const hostedPagePlaceholderPattern = /%%[A-Z0-9_]+%%/g;

function replaceLiteral(content, searchValue, replacementValue) {
  return content.split(searchValue).join(`${replacementValue}`);
}

function replaceHostedPagePlaceholders(content, replacements) {
  let nextContent = content;

  for (const [name, value] of Object.entries(replacements)) {
    nextContent = replaceLiteral(nextContent, `<!-- %%${name}%% -->`, value);
    nextContent = replaceLiteral(nextContent, `/* %%${name}%% */`, value);
    nextContent = replaceLiteral(nextContent, `%%${name}%%`, value);
  }

  return nextContent;
}

function renderHostedPageTemplate(templateFileName, replacements) {
  const templatePath = path.join(hostedPageTemplateDirectory, templateFileName);
  const content = replaceHostedPagePlaceholders(
    fs.readFileSync(templatePath, 'utf8'),
    replacements,
  );

  const unresolvedPlaceholders = content.match(hostedPagePlaceholderPattern);
  if (unresolvedPlaceholders) {
    throw new Error(
      `Unresolved Okta hosted page template placeholders in ${templateFileName}: ${[
        ...new Set(unresolvedPlaceholders),
      ].join(', ')}`,
    );
  }

  return content;
}

function readHostedPagePartial(partialFileName) {
  const partialPath = path.join(hostedPageTemplateDirectory, partialFileName);
  return fs.readFileSync(partialPath, 'utf8').trimEnd();
}

function escapeHtml(value) {
  return `${value}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected "${fieldName}" to be a non-empty string.`);
  }

  return value.trim();
}

function resolveThemeCookieDomain(branding) {
  const value =
    typeof branding.ThemeCookieDomain === 'string'
      ? branding.ThemeCookieDomain.trim().replace(/^\./, '').toLowerCase()
      : '';

  if (!value) {
    return '';
  }

  if (
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      value,
    )
  ) {
    throw new Error('Expected "Branding.ThemeCookieDomain" to be a domain.');
  }

  return value;
}

function deriveBrandLabel(branding) {
  const rawBrandName = requiredString(branding.BrandName, 'Branding.BrandName');
  const normalizedBrandName = rawBrandName.replace(/\s+Customer$/i, '').trim();
  return escapeHtml(normalizedBrandName || rawBrandName);
}

function buildHostedBrandMarkGlyphMarkup() {
  return `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M32 11 16.5 50h7.2l3.15-8.55h10.3L40.3 50h7.2L32 11Zm-2.55 22.3L32 25.55l2.55 7.75h-5.1Z" fill="var(--acme-brand-contrast)" />
        <path d="M43.5 16h5.9v5.9h-5.9z" fill="var(--acme-brand-contrast)" opacity="0.74" />
    </svg>
  `;
}

function buildHostedThemeToggleMarkup() {
  return `
    <div class="acme-theme-toggle" role="group" aria-label="Color theme">
        <button class="acme-theme-toggle__button" type="button" data-acme-theme-choice="light" aria-label="Use light mode" title="Light mode">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.9" />
                <path d="M12 2.75v2.1M12 19.15v2.1M21.25 12h-2.1M4.85 12h-2.1M18.55 5.45l-1.48 1.48M6.93 17.07l-1.48 1.48M18.55 18.55l-1.48-1.48M6.93 6.93 5.45 5.45" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.9" />
            </svg>
        </button>
        <button class="acme-theme-toggle__button" type="button" data-acme-theme-choice="dark" aria-label="Use dark mode" title="Dark mode">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M20 15.35A7.85 7.85 0 0 1 8.65 4a7.86 7.86 0 1 0 11.35 11.35Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" />
            </svg>
        </button>
    </div>
  `;
}

function buildHostedThemeBootstrapScript(branding) {
  const themeCookieDomain = JSON.stringify(resolveThemeCookieDomain(branding));

  return `
    <script nonce="{{nonceValue}}">
        (function() {
            try {
                var key = 'acme-los-theme';
                var legacyKey = 'acme.okta.theme';
                var cookieName = 'acme_theme';
                var cookieDomain = ${themeCookieDomain};
                var cookieTheme = null;
                var cookieEntries = document.cookie.split(';');

                for (var index = 0; index < cookieEntries.length; index += 1) {
                    var entry = cookieEntries[index].trim();
                    if (entry.indexOf(cookieName + '=') !== 0) {
                        continue;
                    }

                    var cookieValue = decodeURIComponent(entry.slice(cookieName.length + 1));
                    cookieTheme = cookieValue === 'light' || cookieValue === 'dark' ? cookieValue : null;
                    break;
                }

                var storedTheme = window.localStorage ? window.localStorage.getItem(key) : null;
                var legacyTheme = window.localStorage ? window.localStorage.getItem(legacyKey) : null;
                var theme = cookieTheme ||
                    (storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : null) ||
                    (legacyTheme === 'light' || legacyTheme === 'dark' ? legacyTheme : null) ||
                    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                        ? 'dark'
                        : 'light');

                document.documentElement.setAttribute('data-acme-theme', theme);
                if (window.localStorage) {
                    window.localStorage.setItem(key, theme);
                    window.localStorage.removeItem(legacyKey);
                }

                var canShare = cookieDomain && (
                    window.location.hostname === cookieDomain ||
                    window.location.hostname.slice(-(cookieDomain.length + 1)) === '.' + cookieDomain
                );
                document.cookie = cookieName + '=' + theme + '; Max-Age=31536000; Path=/; SameSite=Lax; Secure' +
                    (canShare ? '; Domain=' + cookieDomain : '');
            } catch (error) {}
        })();
    </script>
  `;
}

function buildHostedThemeControllerScript(branding) {
  const themeCookieDomain = JSON.stringify(resolveThemeCookieDomain(branding));

  return `
    <script nonce="{{nonceValue}}">
        (function() {
            var key = 'acme-los-theme';
            var legacyKey = 'acme.okta.theme';
            var cookieName = 'acme_theme';
            var cookieDomain = ${themeCookieDomain};
            var mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

            function isTheme(value) {
                return value === 'light' || value === 'dark';
            }

            function readCookieTheme() {
                var cookieEntries = document.cookie.split(';');

                for (var index = 0; index < cookieEntries.length; index += 1) {
                    var entry = cookieEntries[index].trim();
                    if (entry.indexOf(cookieName + '=') !== 0) {
                        continue;
                    }

                    var value = decodeURIComponent(entry.slice(cookieName.length + 1));
                    return isTheme(value) ? value : null;
                }

                return null;
            }

            function readStoredTheme() {
                try {
                    var storedTheme = window.localStorage ? window.localStorage.getItem(key) : null;
                    var legacyTheme = window.localStorage ? window.localStorage.getItem(legacyKey) : null;
                    return isTheme(storedTheme) ? storedTheme : isTheme(legacyTheme) ? legacyTheme : null;
                } catch (error) {
                    return null;
                }
            }

            function resolveTheme() {
                return readCookieTheme() || readStoredTheme() || (mediaQuery && mediaQuery.matches ? 'dark' : 'light');
            }

            function persistTheme(theme) {
                try {
                    if (window.localStorage) {
                        window.localStorage.setItem(key, theme);
                        window.localStorage.removeItem(legacyKey);
                    }
                } catch (error) {}

                var canShare = cookieDomain && (
                    window.location.hostname === cookieDomain ||
                    window.location.hostname.slice(-(cookieDomain.length + 1)) === '.' + cookieDomain
                );
                document.cookie = cookieName + '=' + theme + '; Max-Age=31536000; Path=/; SameSite=Lax; Secure' +
                    (canShare ? '; Domain=' + cookieDomain : '');
            }

            function applyTheme(theme) {
                var nextTheme = isTheme(theme) ? theme : 'light';
                document.documentElement.setAttribute('data-acme-theme', nextTheme);

                Array.prototype.forEach.call(
                    document.querySelectorAll('[data-acme-theme-choice]'),
                    function(button) {
                        button.setAttribute(
                            'aria-pressed',
                            button.getAttribute('data-acme-theme-choice') === nextTheme ? 'true' : 'false'
                        );
                    }
                );
            }

            Array.prototype.forEach.call(
                document.querySelectorAll('[data-acme-theme-choice]'),
                function(button) {
                    button.addEventListener('click', function() {
                        var nextTheme = button.getAttribute('data-acme-theme-choice');
                        if (!isTheme(nextTheme)) {
                            return;
                        }

                        persistTheme(nextTheme);
                        applyTheme(nextTheme);
                    });
                }
            );

            if (mediaQuery) {
                var syncSystemTheme = function() {
                    if (!readStoredTheme()) {
                        applyTheme(resolveTheme());
                    }
                };

                if (mediaQuery.addEventListener) {
                    mediaQuery.addEventListener('change', syncSystemTheme);
                } else if (mediaQuery.addListener) {
                    mediaQuery.addListener(syncSystemTheme);
                }
            }

            var theme = resolveTheme();
            persistTheme(theme);
            applyTheme(theme);
        })();
    </script>
  `;
}

function buildHostedThemeStyleMarkup(themeCss) {
  return `
    <style nonce="{{nonceValue}}">
        ${themeCss}
    </style>
  `;
}

function buildHostedBrandHeaderMarkup({ brandLabel, productLabel }) {
  return `
    <header class="acme-brand-header">
        <div class="acme-brand-header__inner">
            <div class="acme-brand-header__lockup" role="img" aria-label="${brandLabel} ${productLabel}">
                <span class="acme-brand-header__mark">
                    ${buildHostedBrandMarkGlyphMarkup()}
                </span>
                <span class="acme-brand-header__copy">
                    <span class="acme-brand-header__eyebrow">${brandLabel}</span>
                    <span class="acme-brand-header__title">${productLabel}</span>
                </span>
            </div>
            ${buildHostedThemeToggleMarkup()}
        </div>
    </header>
  `;
}

// Retained temporarily while the hosted-page template continues to evolve.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildHostedCopyrightMarkupLegacy(year) {
  return `<p class="acme-auth-copyright">© ${year} ACME LOS. All rights reserved.</p>`;
}

// Retained temporarily while the hosted-page template continues to evolve.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildHostedThemeCssLegacy(branding) {
  const primaryColor = requiredString(
    branding.PrimaryColor,
    'Branding.PrimaryColor',
  );
  const primaryContrastColor = requiredString(
    branding.PrimaryContrastColor,
    'Branding.PrimaryContrastColor',
  );
  const backgroundColor = requiredString(
    branding.BackgroundColor,
    'Branding.BackgroundColor',
  );
  const surfaceColor = requiredString(
    branding.SurfaceColor,
    'Branding.SurfaceColor',
  );
  const textColor = requiredString(branding.TextColor, 'Branding.TextColor');
  const mutedTextColor = requiredString(
    branding.MutedTextColor,
    'Branding.MutedTextColor',
  );
  const linkColor = requiredString(branding.LinkColor, 'Branding.LinkColor');
  const borderColor = requiredString(
    branding.BorderColor,
    'Branding.BorderColor',
  );
  const focusColor = requiredString(branding.FocusColor, 'Branding.FocusColor');
  const accentColor = requiredString(
    branding.AccentColor,
    'Branding.AccentColor',
  );

  return `
        :root {
            color-scheme: light;
            --acme-background: ${backgroundColor};
            --acme-background-top: #fffdf8;
            --acme-hero-glow-top: rgba(24, 122, 83, 0.03);
            --acme-hero-glow-side: rgba(214, 176, 95, 0.04);
            --acme-surface: ${surfaceColor};
            --acme-surface-strong: #e8eee7;
            --acme-card: #fffdfa;
            --acme-field-bg: #fffdfa;
            --acme-guidance-bg: #eef3ec;
            --acme-text: ${textColor};
            --acme-muted-text: ${mutedTextColor};
            --acme-border: ${borderColor};
            --acme-link: ${linkColor};
            --acme-focus: ${focusColor};
            --acme-ring-soft: rgba(36, 149, 103, 0.18);
            --acme-brand: ${primaryColor};
            --acme-brand-contrast: ${primaryContrastColor};
            --acme-brand-shadow: rgba(24, 122, 83, 0.22);
            --acme-accent: ${accentColor};
            --acme-critical-border: rgba(178, 74, 61, 0.22);
            --acme-critical-bg: rgba(178, 74, 61, 0.08);
            --acme-critical-text: #8f352b;
            --acme-critical-icon-bg: #d94f43;
            --acme-critical-icon-text: #fffaf7;
            --acme-header-shadow: 0 18px 40px rgba(10, 24, 20, 0.06);
            --acme-card-shadow: 0 18px 42px rgba(10, 24, 20, 0.10);
            --acme-font-display: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
            --acme-font-body: Aptos, 'Segoe UI Variable Display', 'Segoe UI', sans-serif;
        }
  `;
}

function buildHostedCopyrightMarkup(year) {
  return `<p class="acme-auth-copyright">&copy; ${year} ACME LOS. All rights reserved.</p>`;
}

function buildHostedSupportFooterMarkup({
  supportPhoneHref,
  supportPhone,
  supportHours,
  helpUrl,
  copyrightYear,
}) {
  return `
    <footer class="acme-auth-footer">
        <div class="acme-auth-support">
            <a href="${escapeHtml(helpUrl)}">Contact support</a>
            <span class="acme-auth-support__divider" aria-hidden="true">&bull;</span>
            <a href="${supportPhoneHref}">${supportPhone}</a>
            <span>${supportHours}</span>
        </div>
        ${buildHostedCopyrightMarkup(copyrightYear)}
    </footer>
  `;
}

function buildHostedThemeCss(branding) {
  const primaryColor = requiredString(
    branding.PrimaryColor,
    'Branding.PrimaryColor',
  );
  const primaryContrastColor = requiredString(
    branding.PrimaryContrastColor,
    'Branding.PrimaryContrastColor',
  );
  const backgroundColor = requiredString(
    branding.BackgroundColor,
    'Branding.BackgroundColor',
  );
  const surfaceColor = requiredString(
    branding.SurfaceColor,
    'Branding.SurfaceColor',
  );
  const textColor = requiredString(branding.TextColor, 'Branding.TextColor');
  const mutedTextColor = requiredString(
    branding.MutedTextColor,
    'Branding.MutedTextColor',
  );
  const linkColor = requiredString(branding.LinkColor, 'Branding.LinkColor');
  const borderColor = requiredString(
    branding.BorderColor,
    'Branding.BorderColor',
  );
  const focusColor = requiredString(branding.FocusColor, 'Branding.FocusColor');
  const accentColor = requiredString(
    branding.AccentColor,
    'Branding.AccentColor',
  );

  return `
        :root {
            color-scheme: light;
            --acme-background: ${backgroundColor};
            --acme-background-top: #fffef9;
            --acme-hero-glow-top: rgba(17, 98, 67, 0.12);
            --acme-hero-glow-side: rgba(214, 176, 95, 0.13);
            --acme-hero-glow-top-size: 76rem 36rem;
            --acme-hero-glow-side-size: 72rem 32rem;
            --acme-surface: ${surfaceColor};
            --acme-surface-strong: #e8eee7;
            --acme-surface-accent: #dde6de;
            --acme-surface-spot: #efe3c3;
            --acme-card: #fffdf8;
            --acme-field-bg: #fffdf8;
            --acme-guidance-bg: #edf3ec;
            --acme-text: ${textColor};
            --acme-muted-text: ${mutedTextColor};
            --acme-border: ${borderColor};
            --acme-border-strong: #9fb1a4;
            --acme-link: ${linkColor};
            --acme-focus: ${focusColor};
            --acme-ring-soft: rgba(36, 149, 103, 0.18);
            --acme-brand: ${primaryColor};
            --acme-brand-strong: #0d5338;
            --acme-brand-contrast: ${primaryContrastColor};
            --acme-brand-shadow: rgba(24, 122, 83, 0.22);
            --acme-accent: ${accentColor};
            --acme-accent-ink: #5a4212;
            --acme-critical-border: rgba(178, 74, 61, 0.22);
            --acme-critical-bg: rgba(178, 74, 61, 0.08);
            --acme-critical-text: #8f352b;
            --acme-critical-icon-bg: #d94f43;
            --acme-critical-icon-text: #fffaf7;
            --acme-header-shadow: 0 18px 40px rgba(10, 24, 20, 0.06);
            --acme-card-shadow: 0 24px 60px rgba(10, 24, 20, 0.12);
            --acme-font-display: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
            --acme-font-body: Aptos, 'Segoe UI Variable Display', 'Segoe UI', sans-serif;
        }

        :root[data-acme-theme='dark'] {
            color-scheme: dark;
            --acme-background: #101b19;
            --acme-background-top: #13211f;
            --acme-hero-glow-top: rgba(70, 166, 122, 0.13);
            --acme-hero-glow-side: rgba(212, 174, 96, 0.10);
            --acme-hero-glow-top-size: 72rem 32rem;
            --acme-hero-glow-side-size: 66rem 28rem;
            --acme-surface: #142321;
            --acme-surface-strong: #1a2c29;
            --acme-surface-accent: #1a312c;
            --acme-surface-spot: #3b3224;
            --acme-card: #172521;
            --acme-field-bg: #172521;
            --acme-guidance-bg: #1c2d29;
            --acme-text: #f4efe6;
            --acme-muted-text: #c4cbc6;
            --acme-border: #2a423d;
            --acme-border-strong: #3b5952;
            --acme-link: #86d6aa;
            --acme-focus: #72c79b;
            --acme-ring-soft: rgba(114, 199, 155, 0.22);
            --acme-brand: #6fb38d;
            --acme-brand-strong: #8fd0a9;
            --acme-brand-contrast: #0d1614;
            --acme-brand-shadow: rgba(70, 166, 122, 0.24);
            --acme-accent: #d4ae60;
            --acme-accent-ink: #f5e0b7;
            --acme-critical-border: rgba(255, 157, 141, 0.28);
            --acme-critical-bg: rgba(255, 157, 141, 0.12);
            --acme-critical-text: #ffb9ac;
            --acme-critical-icon-bg: #ff8f80;
            --acme-critical-icon-text: #1c0f0d;
            --acme-header-shadow: 0 22px 44px rgba(2, 12, 10, 0.28);
            --acme-card-shadow: 0 18px 42px rgba(2, 12, 10, 0.24);
        }

        @media (max-width: 640px) {
            :root {
                --acme-hero-glow-top: rgba(17, 98, 67, 0.08);
                --acme-hero-glow-side: rgba(214, 176, 95, 0.09);
                --acme-hero-glow-top-size: 44rem 18rem;
                --acme-hero-glow-side-size: 40rem 16rem;
            }
        }

        @media (max-width: 640px) {
            :root[data-acme-theme='dark'] {
                --acme-hero-glow-top: rgba(70, 166, 122, 0.09);
                --acme-hero-glow-side: rgba(212, 174, 96, 0.06);
                --acme-hero-glow-top-size: 38rem 15rem;
                --acme-hero-glow-side-size: 34rem 13rem;
            }
        }
  `;
}

export function buildHostedSignInPageContent() {
  const hostedSignInController = readHostedPagePartial(
    'hosted-sign-in-page.controller.js',
  );

  return renderHostedPageTemplate('hosted-sign-in-page.html', {
    HOSTED_SIGN_IN_CONTROLLER: hostedSignInController,
  });
}

export function buildHostedErrorPageContent(branding) {
  const brandLabel = deriveBrandLabel(branding);
  const productName = escapeHtml(
    requiredString(branding.ProductName, 'Branding.ProductName'),
  );
  const supportPhone = escapeHtml(
    requiredString(branding.SupportPhone, 'Branding.SupportPhone'),
  );
  const supportPhoneHref = `tel:+${requiredString(
    branding.SupportPhone,
    'Branding.SupportPhone',
  ).replaceAll(/\D/g, '')}`;
  const supportHours = escapeHtml(
    requiredString(branding.SupportHours, 'Branding.SupportHours'),
  );
  const copyrightYear = new Date().getFullYear();
  const themeCss = buildHostedThemeCss(branding);

  return renderHostedPageTemplate('hosted-error-page.html', {
    THEME_BOOTSTRAP_SCRIPT: buildHostedThemeBootstrapScript(branding),
    THEME_STYLE_MARKUP: buildHostedThemeStyleMarkup(themeCss),
    BRAND_HEADER_MARKUP: buildHostedBrandHeaderMarkup({
      brandLabel,
      productLabel: productName,
    }),
    PRODUCT_NAME: productName,
    SUPPORT_FOOTER_MARKUP: buildHostedSupportFooterMarkup({
      supportPhoneHref,
      supportPhone,
      supportHours,
      helpUrl: requiredString(branding.HelpUrl, 'Branding.HelpUrl'),
      copyrightYear,
    }),
    THEME_CONTROLLER_SCRIPT: buildHostedThemeControllerScript(branding),
  });
}
