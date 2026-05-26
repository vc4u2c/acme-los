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

export function buildHostedSignInPageContent(branding) {
  const titleCopy = {
    signInTitle: requiredString(branding.SignInTitle, 'Branding.SignInTitle'),
    signInSubtitle: requiredString(
      branding.SignInSubtitle,
      'Branding.SignInSubtitle',
    ),
    signUpTitle: requiredString(branding.SignUpTitle, 'Branding.SignUpTitle'),
    signUpSubtitle: requiredString(
      branding.SignUpSubtitle,
      'Branding.SignUpSubtitle',
    ),
  };

  const supportCopy = {
    phone: requiredString(branding.SupportPhone, 'Branding.SupportPhone'),
    hours: requiredString(branding.SupportHours, 'Branding.SupportHours'),
  };
  const supportPhoneHref = `tel:+${supportCopy.phone.replaceAll(/\D/g, '')}`;
  const helpUrl = requiredString(branding.HelpUrl, 'Branding.HelpUrl');
  const copyrightYear = new Date().getFullYear();

  const brandLabel = deriveBrandLabel(branding);
  const productLabel = escapeHtml(
    requiredString(branding.ProductName, 'Branding.ProductName'),
  );
  const themeCss = buildHostedThemeCss(branding);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex,nofollow" />
    <link href="{{themedStylesUrl}}" rel="stylesheet" type="text/css">
    <link rel="shortcut icon" href="{{faviconUrl}}" type="image/x-icon"/>

    <title>{{pageTitle}}</title>
    {{{SignInWidgetResources}}}
    ${buildHostedThemeBootstrapScript(branding)}

    <style nonce="{{nonceValue}}">
        {{#useSiwGen3}}
        html {
            font-size: 87.5%;
        }
        {{/useSiwGen3}}

        ${themeCss}

        html, body {
            min-height: 100%;
            max-width: 100%;
            overflow-x: clip;
        }

        *, *::before, *::after {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 0;
            color: var(--acme-text);
            background:
                radial-gradient(ellipse at top right, var(--acme-hero-glow-top) 0%, transparent 68%),
                radial-gradient(ellipse at top left, var(--acme-hero-glow-side) 0%, transparent 72%),
                linear-gradient(
                    180deg,
                    var(--acme-background-top) 0%,
                    var(--acme-background) 22%,
                    var(--acme-background) 100%
                );
            background-position:
                top right,
                top left,
                top left;
            background-repeat: no-repeat;
            background-size:
                var(--acme-hero-glow-top-size),
                var(--acme-hero-glow-side-size),
                100% 100%;
            font-family: var(--acme-font-body);
            overflow-x: hidden;
        }

        #login-bg-image-id {
            display: none !important;
            background-image: none !important;
        }

        .acme-brand-header {
            position: relative;
            z-index: 1;
            border-bottom: 1px solid var(--acme-border);
            background: var(--acme-surface);
            box-shadow: var(--acme-header-shadow);
        }

        .acme-brand-header__inner {
            width: 100%;
            max-width: 72rem;
            margin: 0 auto;
            padding: 0.65rem 1.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }

        .acme-brand-header__lockup {
            display: inline-flex;
            align-items: center;
            gap: 0.9rem;
            min-width: 0;
            max-width: 100%;
        }

        .acme-brand-header__mark {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 2.5rem;
            height: 2.5rem;
            border-radius: 1rem;
            flex-shrink: 0;
            background: var(--acme-brand);
            box-shadow: 0 12px 24px var(--acme-brand-shadow);
        }

        .acme-brand-header__mark svg {
            width: 1.16rem;
            height: 1.16rem;
            display: block;
        }

        .acme-brand-header__copy {
            display: inline-flex;
            flex-direction: column;
            min-width: 0;
            max-width: 100%;
        }

        .acme-brand-header__eyebrow {
            color: var(--acme-muted-text);
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.2em;
            text-transform: uppercase;
        }

        .acme-brand-header__title {
            color: var(--acme-text);
            font-family: var(--acme-font-display);
            font-size: 1.22rem;
            line-height: 1.05;
        }

        .acme-theme-toggle {
            display: inline-flex;
            align-items: center;
            gap: 0.15rem;
            padding: 0.18rem;
            border: 1px solid var(--acme-border);
            border-radius: 999px;
            background: var(--acme-surface-strong);
            flex-shrink: 0;
        }

        .acme-theme-toggle__button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 1.82rem;
            height: 1.82rem;
            border: 0;
            border-radius: 999px;
            background: transparent;
            color: var(--acme-muted-text);
            cursor: pointer;
        }

        .acme-theme-toggle__button[aria-pressed='true'] {
            background: var(--acme-brand);
            color: var(--acme-brand-contrast);
        }

        .acme-theme-toggle__button svg {
            width: 0.92rem;
            height: 0.92rem;
            display: block;
        }

        .acme-auth-shell {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 31rem;
            margin: 0 auto;
            padding: 1.35rem 1rem 1.15rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow-x: clip;
        }

        .acme-auth-intro {
            margin: 0 0 0.75rem;
            text-align: center;
            width: 100%;
        }

        .acme-auth-eyebrow {
            margin: 0 0 0.55rem;
            color: var(--acme-muted-text);
            font-size: 0.7rem;
            font-weight: 700;
            letter-spacing: 0.18em;
            text-transform: uppercase;
        }

        .acme-auth-title {
            margin: 0;
            color: var(--acme-text);
            font-size: 1.55rem;
            line-height: 1.12;
            font-family: var(--acme-font-display);
        }

        .acme-auth-subtitle {
            margin: 0.5rem 0 0;
            color: var(--acme-muted-text);
            font-size: 0.9rem;
            line-height: 1.45;
        }

        .acme-auth-guidance {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            margin: 0.7rem 0 0.85rem;
            padding: 0.62rem 0.78rem;
            border: 1px solid var(--acme-border);
            border-radius: 0.95rem;
            background: var(--acme-guidance-bg);
            color: var(--acme-muted-text);
            font-size: 0.84rem;
            line-height: 1.45;
            text-align: center;
        }

        .acme-auth-footer {
            width: 100%;
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid var(--acme-border);
            text-align: center;
        }

        .acme-auth-support {
            text-align: center;
            color: var(--acme-muted-text);
            font-size: 0.9rem;
            line-height: 1.55;
        }

        .acme-auth-support {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 0.35rem 0.55rem;
            margin-top: 0.7rem;
        }

        .acme-auth-support__divider {
            color: var(--acme-border-strong);
        }

        #okta-login-container {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            margin: 0 auto;
            display: flex;
            justify-content: center;
            overflow-x: clip;
        }

        #okta-login-container #okta-sign-in,
        #okta-login-container .auth-container {
            max-width: none !important;
            width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
            border: 1px solid var(--acme-border);
            border-radius: 1.55rem;
            background: linear-gradient(
                180deg,
                var(--acme-card) 0%,
                var(--acme-surface) 100%
            );
            box-shadow: var(--acme-card-shadow);
            overflow: hidden;
        }

        #okta-login-container .auth-content,
        #okta-login-container .siw-main-view,
        #okta-login-container .siw-main-footer {
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
        }

        #okta-login-container .auth-header,
        #okta-login-container .okta-sign-in-header,
        #okta-login-container .siw-main-header .auth-org-logo,
        #okta-login-container .siw-main-header .logo {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            overflow: hidden !important;
        }

        #okta-login-container .auth-content {
            padding: 1.15rem 1.25rem 0 !important;
        }

        #okta-login-container .siw-main-view {
            margin: 0 !important;
            padding: 0 !important;
        }

        #okta-login-container .siw-main-footer {
            width: 100% !important;
            padding: 0.2rem 1.25rem 1.25rem !important;
            border-top: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 0.5rem !important;
            text-align: center !important;
        }

        #okta-login-container .siw-main-footer > * {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
            text-align: center !important;
        }

        #okta-login-container .siw-main-footer a,
        #okta-login-container .siw-main-footer .link-button,
        #okta-login-container .siw-main-footer .js-back {
            display: inline-flex !important;
            align-items: center !important;
            width: auto !important;
            max-width: 100% !important;
            min-width: 0 !important;
            white-space: normal !important;
            word-break: normal !important;
            overflow-wrap: normal !important;
            writing-mode: horizontal-tb !important;
            text-align: center !important;
        }

        #okta-login-container .auth-content-inner,
        #okta-login-container .siw-main-body,
        #okta-login-container .o-form,
        #okta-login-container form {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
        }

        #okta-login-container .o-form-content,
        #okta-login-container .authenticator-list,
        #okta-login-container .authenticator-enrollments-list,
        #okta-login-container .authenticator-verify-list,
        #okta-login-container .authenticator-list ul,
        #okta-login-container .authenticator-enrollments-list ul,
        #okta-login-container .authenticator-verify-list ul,
        #okta-login-container .siw-main-body > div,
        #okta-login-container .siw-main-body > section {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
        }

        #okta-login-container .authenticator-list,
        #okta-login-container .authenticator-enrollments-list,
        #okta-login-container .authenticator-verify-list,
        #okta-login-container .authenticator-list ul,
        #okta-login-container .authenticator-enrollments-list ul,
        #okta-login-container .authenticator-verify-list ul {
            padding: 0 !important;
        }

        #okta-login-container .auth-content *,
        #okta-login-container .siw-main-body *,
        #okta-login-container form * {
            min-width: 0 !important;
            max-width: 100%;
        }

        #okta-login-container .okta-form-title,
        #okta-login-container h2,
        #okta-login-container h3 {
            color: var(--acme-text) !important;
            font-family: var(--acme-font-display) !important;
            font-size: 1.35rem !important;
            line-height: 1.12 !important;
            margin-top: 0 !important;
        }

        #okta-login-container .okta-form-subtitle,
        #okta-login-container .o-form-explain,
        #okta-login-container .o-form-explain *,
        #okta-login-container .okta-form-label,
        #okta-login-container .okta-form-input-error,
        #okta-login-container .o-form-input-error,
        #okta-login-container .ion-form-field-tooltip {
            color: var(--acme-muted-text) !important;
            font-size: 0.92rem !important;
            line-height: 1.55 !important;
        }

        #okta-login-container .siw-main-body p,
        #okta-login-container .siw-main-body p span,
        #okta-login-container .siw-main-body p em {
            color: var(--acme-muted-text) !important;
        }

        #okta-login-container .siw-main-body p strong,
        #okta-login-container .siw-main-body p b,
        #okta-login-container .siw-main-body p [class*='strong'],
        #okta-login-container .siw-main-body p [class*='identifier'],
        #okta-login-container .siw-main-body p [class*='highlight'] {
            color: var(--acme-text) !important;
            font-weight: 700 !important;
        }

        #okta-login-container .siw-main-body p a {
            color: var(--acme-link) !important;
        }

        #okta-login-container .acme-identifier-contrast,
        #okta-login-container [data-se*='identifier'],
        #okta-login-container [data-se*='identifier'] *,
        #okta-login-container [class*='identifier'],
        #okta-login-container [class*='identifier'] * {
            color: var(--acme-text) !important;
            -webkit-text-fill-color: var(--acme-text) !important;
            font-weight: 700 !important;
            opacity: 1 !important;
        }

        #okta-login-container .o-form-head,
        #okta-login-container .siw-form-header,
        #okta-login-container .siw-main-header {
            margin-bottom: 0.75rem !important;
            padding: 0 !important;
        }

        body[data-acme-auth-state='enroll'] #okta-login-container .siw-main-header,
        body[data-acme-auth-state='password'] #okta-login-container .siw-main-header,
        body[data-acme-auth-state='verify'] #okta-login-container .siw-main-header {
            display: none !important;
        }

        #okta-login-container label,
        #okta-login-container .o-form-label,
        #okta-login-container .siw-label,
        #okta-login-container .select-authenticator-label {
            color: var(--acme-muted-text) !important;
            font-size: 0.74rem !important;
            font-weight: 700 !important;
            letter-spacing: 0.16em !important;
            text-transform: uppercase !important;
        }

        #okta-login-container input,
        #okta-login-container select,
        #okta-login-container textarea,
        #okta-login-container .o-form-input input,
        #okta-login-container .selectize-input,
        #okta-login-container .chzn-single,
        #okta-login-container .okta-form-input-field {
            min-height: 2.35rem !important;
            border: 1px solid var(--acme-border) !important;
            border-radius: 0.78rem !important;
            background: var(--acme-field-bg) !important;
            color: var(--acme-text) !important;
            box-shadow: none !important;
            font-size: 0.95rem !important;
        }

        #okta-login-container input:focus,
        #okta-login-container select:focus,
        #okta-login-container textarea:focus,
        #okta-login-container .o-form-input input:focus,
        #okta-login-container .selectize-input.focus {
            border-color: var(--acme-focus) !important;
            box-shadow: 0 0 0 3px var(--acme-ring-soft) !important;
            outline: none !important;
        }

        #okta-login-container .button,
        #okta-login-container input[type="button"],
        #okta-login-container input[type="submit"] {
            min-height: 2.35rem !important;
            border-radius: 0.8rem !important;
            border: 1px solid var(--acme-border) !important;
            background: var(--acme-field-bg) !important;
            color: var(--acme-text) !important;
            box-shadow: none !important;
            font-size: 0.86rem !important;
            font-weight: 700 !important;
            padding: 0.44rem 0.78rem !important;
            transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, filter 120ms ease;
        }

        #okta-login-container .button-primary,
        #okta-login-container .button.button-primary,
        #okta-login-container input[type="submit"] {
            min-height: 2.42rem !important;
            width: auto !important;
            min-width: 12rem !important;
            max-width: 100% !important;
            border-radius: 1rem !important;
            border: 0 !important;
            background: var(--acme-brand) !important;
            color: var(--acme-brand-contrast) !important;
            box-shadow: none !important;
            font-size: 0.88rem !important;
            font-weight: 700 !important;
            padding: 0.48rem 1rem !important;
        }

        #okta-login-container .o-form-button-bar,
        #okta-login-container .button-bar {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 0.65rem !important;
            margin-top: 0.9rem !important;
            padding: 0 !important;
        }

        #okta-login-container .button:hover,
        #okta-login-container input[type="button"]:hover,
        #okta-login-container input[type="submit"]:hover,
        #okta-login-container .button-primary:hover,
        #okta-login-container .button.button-primary:hover {
            filter: brightness(0.96);
        }

        #okta-login-container .button.button-secondary,
        #okta-login-container .button-secondary,
        #okta-login-container .button.cancel,
        #okta-login-container a.button-link {
            border: 1px solid var(--acme-border) !important;
            background: var(--acme-field-bg) !important;
            color: var(--acme-text) !important;
        }

        #okta-login-container a,
        #okta-login-container .link,
        #okta-login-container .registration-link,
        #okta-login-container .js-help {
            color: var(--acme-link) !important;
            font-weight: 600 !important;
            text-decoration: none !important;
        }

        #okta-login-container a:hover,
        #okta-login-container .link:hover,
        #okta-login-container .registration-link:hover,
        #okta-login-container .js-help:hover {
            text-decoration: underline !important;
        }

        #okta-login-container .o-form-error-container,
        #okta-login-container .infobox,
        #okta-login-container .okta-form-infobox-error,
        #okta-login-container .okta-form-infobox-warning,
        #okta-login-container .okta-form-infobox-success {
            border-radius: 1rem !important;
        }

        #okta-login-container .okta-form-infobox-error,
        #okta-login-container .o-form-error-container {
            border: 1px solid var(--acme-critical-border) !important;
            background: var(--acme-critical-bg) !important;
        }

        #okta-login-container .authenticator-button,
        #okta-login-container .select-authenticator-authenticate,
        #okta-login-container .okta-form-subsection,
        #okta-login-container .siw-enroll-card,
        #okta-login-container .authenticator-enrollments-list li {
            border-radius: 1rem !important;
            border-color: var(--acme-border) !important;
            background: var(--acme-field-bg) !important;
        }

        #okta-login-container .authenticator-button,
        #okta-login-container .okta-form-subsection,
        #okta-login-container .siw-enroll-card,
        #okta-login-container .authenticator-enrollments-list li {
            padding: 0.72rem !important;
        }

        #okta-login-container .authenticator-enrollments-list li,
        #okta-login-container .authenticator-list li,
        #okta-login-container .authenticator-verify-list li {
            list-style: none !important;
            width: 100% !important;
            max-width: 100% !important;
        }

        #okta-login-container .acme-authenticator-item {
            display: grid !important;
            grid-template-columns: auto minmax(0, 1fr) auto !important;
            align-items: center !important;
            column-gap: 0.9rem !important;
            row-gap: 0.4rem !important;
        }

        #okta-login-container .acme-authenticator-badge {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 2rem !important;
            height: 2rem !important;
            border-radius: 0.72rem !important;
            border: 1px solid var(--acme-border) !important;
            background: linear-gradient(
                180deg,
                var(--acme-surface-strong) 0%,
                var(--acme-surface-accent) 100%
            ) !important;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
            color: var(--acme-brand) !important;
            flex-shrink: 0 !important;
        }

        #okta-login-container .acme-authenticator-badge svg {
            width: 0.9rem !important;
            height: 0.9rem !important;
            display: block !important;
        }

        #okta-login-container .acme-authenticator-copy {
            min-width: 0 !important;
        }

        #okta-login-container .acme-authenticator-action {
            width: auto !important;
            min-width: 4rem !important;
            justify-self: end !important;
            align-self: center !important;
        }

        #okta-login-container .acme-authenticator-action-wrap {
            display: flex !important;
            align-items: center !important;
            justify-content: flex-end !important;
            width: auto !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #okta-login-container .select-authenticator-authenticate,
        #okta-login-container .authenticator-button {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            align-items: center !important;
            column-gap: 0.85rem !important;
            row-gap: 0.6rem !important;
        }

        #okta-login-container .select-authenticator-authenticate .button,
        #okta-login-container .authenticator-button .button,
        #okta-login-container .authenticator-enrollments-list li .button {
            min-width: 4rem !important;
            min-height: 2.05rem !important;
            width: auto !important;
            align-self: center !important;
            justify-content: center !important;
            border-radius: 0.8rem !important;
            padding: 0.34rem 0.68rem !important;
            background: var(--acme-brand) !important;
            color: var(--acme-brand-contrast) !important;
            border: 0 !important;
            white-space: nowrap !important;
            font-size: 0.82rem !important;
            line-height: 1.1 !important;
        }

        #okta-login-container .authenticator-enrollments-list li p,
        #okta-login-container .authenticator-list li p,
        #okta-login-container .authenticator-verify-list li p,
        #okta-login-container .authenticator-enrollments-list li [class*='description'],
        #okta-login-container .authenticator-list li [class*='description'],
        #okta-login-container .authenticator-verify-list li [class*='description'],
        #okta-login-container .siw-user-account,
        #okta-login-container .siw-user-account * {
            color: var(--acme-muted-text) !important;
        }

        #okta-login-container .select-authenticator-authenticate > :first-child,
        #okta-login-container .authenticator-button > :first-child {
            min-width: 0 !important;
            max-width: 100% !important;
            overflow-wrap: anywhere !important;
        }

        #okta-login-container .select-authenticator-authenticate .select-authenticator-label,
        #okta-login-container .authenticator-button .select-authenticator-label,
        #okta-login-container .select-authenticator-authenticate h2,
        #okta-login-container .select-authenticator-authenticate h3,
        #okta-login-container .authenticator-button h2,
        #okta-login-container .authenticator-button h3 {
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
        }

        #okta-login-container .beacon-container,
        #okta-login-container .mfa-verify-passcode .beacon-container,
        #okta-login-container .authenticator-verify-list .beacon-container {
            display: none !important;
        }

        #okta-login-container .beacon,
        #okta-login-container .mfa-verify-passcode .beacon,
        #okta-login-container .authenticator-verify-list .beacon {
            display: none !important;
        }

        #okta-login-container .siw-main-footer .acme-auth-recovery-link {
            color: var(--acme-link) !important;
            font-size: 0.92rem !important;
            font-weight: 600 !important;
        }

        #okta-login-container .siw-main-footer .acme-registration-row {
            display: inline-flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 0.35rem !important;
            color: var(--acme-text) !important;
            font-size: 0.98rem !important;
            font-weight: 600 !important;
            line-height: 1.5 !important;
            opacity: 1 !important;
        }

        #okta-login-container .siw-main-footer .acme-registration-prompt {
            color: var(--acme-text) !important;
            font-size: 0.98rem !important;
            font-weight: 600 !important;
            opacity: 1 !important;
        }

        #okta-login-container .siw-main-footer .acme-registration-link {
            color: var(--acme-link) !important;
            font-size: 0.98rem !important;
            font-weight: 700 !important;
        }

        #okta-login-container .registration-container {
            display: inline-flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 0.35rem !important;
            width: 100% !important;
            color: var(--acme-text) !important;
            text-align: center !important;
            font-size: 0.92rem !important;
            line-height: 1.5 !important;
        }

        #okta-login-container .registration-container,
        #okta-login-container .registration-container span,
        #okta-login-container .registration-container p,
        #okta-login-container .registration-container div {
            color: var(--acme-text) !important;
            font-size: 0.98rem !important;
            font-weight: 600 !important;
            opacity: 1 !important;
        }

        #okta-login-container .registration-container .registration-link,
        #okta-login-container .registration-container a[href*="signup"] {
            color: var(--acme-link) !important;
            font-size: 0.98rem !important;
            font-weight: 700 !important;
        }

        #okta-login-container .remember-me,
        #okta-login-container .custom-checkbox,
        #okta-login-container [data-se*='remember'],
        #okta-login-container [data-se='o-form-fieldset-rememberMe'] {
            color: var(--acme-muted-text) !important;
            font-size: 0.86rem !important;
            line-height: 1.45 !important;
        }

        #okta-login-container .acme-auth-hints {
            margin: 0.85rem 0 0 !important;
            display: grid !important;
            gap: 0.55rem !important;
        }

        #okta-login-container .acme-auth-hint {
            padding: 0.7rem 0.78rem !important;
            border: 1px solid var(--acme-border) !important;
            border-radius: 0.95rem !important;
            background: var(--acme-guidance-bg) !important;
            text-align: left !important;
        }

        #okta-login-container .acme-auth-hint__title {
            margin: 0 !important;
            color: var(--acme-text) !important;
            font-size: 0.84rem !important;
            font-weight: 700 !important;
            line-height: 1.35 !important;
        }

        #okta-login-container .acme-auth-hint__body {
            margin: 0.18rem 0 0 !important;
            color: var(--acme-muted-text) !important;
            font-size: 0.82rem !important;
            line-height: 1.45 !important;
        }

        .acme-auth-copyright {
            margin: 0.15rem 0 0;
            text-align: center;
            color: var(--acme-muted-text);
            font-size: 0.82rem;
            line-height: 1.55;
        }

        .acme-auth-support a {
            color: var(--acme-link);
            font-weight: 600;
            text-decoration: none;
        }

        .acme-auth-support a:hover {
            text-decoration: underline;
        }

        .acme-auth-support a:focus-visible {
            outline: 2px solid var(--acme-focus);
            outline-offset: 3px;
            border-radius: 0.25rem;
        }

        @media (max-width: 640px) {
            .acme-auth-shell {
                max-width: 100%;
                padding: 1.35rem 0.9rem 1.15rem;
            }

            .acme-brand-header__inner {
                padding: 0.85rem 1rem;
                flex-wrap: wrap;
                align-items: flex-start;
            }

            .acme-brand-header__title {
                font-size: 1.3rem;
            }

            .acme-brand-header__lockup {
                width: 100%;
            }

            .acme-auth-title {
                font-size: 1.55rem;
            }

            .acme-auth-guidance {
                margin: 0.7rem 0 0.95rem;
                padding: 0.68rem 0.84rem;
                font-size: 0.88rem;
            }

            #okta-login-container #okta-sign-in,
            #okta-login-container .auth-container {
                border-radius: 1.45rem;
            }

            #okta-login-container .auth-content {
                padding: 1rem 0.95rem 0 !important;
            }

            #okta-login-container .siw-main-footer {
                padding: 0 0.95rem 1rem !important;
            }

            #okta-login-container .okta-form-title,
            #okta-login-container h2,
            #okta-login-container h3 {
                font-size: 1.24rem !important;
            }

            #okta-login-container .button-primary,
            #okta-login-container .button.button-primary,
            #okta-login-container input[type="submit"] {
                width: 100% !important;
                min-width: 0 !important;
            }

            .acme-auth-support {
                flex-direction: column;
                gap: 0.25rem;
            }

            .acme-auth-support__divider {
                display: none;
            }

            #okta-login-container .select-authenticator-authenticate,
            #okta-login-container .authenticator-button {
                grid-template-columns: minmax(0, 1fr) auto !important;
                gap: 0.7rem !important;
                padding: 0.75rem !important;
            }

            #okta-login-container .select-authenticator-authenticate .button,
            #okta-login-container .authenticator-button .button,
            #okta-login-container .authenticator-enrollments-list li .button {
                width: auto !important;
                min-width: 4.55rem !important;
            }

            #okta-login-container .acme-authenticator-item {
                column-gap: 0.75rem !important;
            }

            #okta-login-container .acme-authenticator-badge {
                width: 2.2rem !important;
                height: 2.2rem !important;
                border-radius: 0.76rem !important;
            }
        }
    </style>
</head>
<body>
    <div id="login-bg-image-id" class="login-bg-image tb--background"></div>
    ${buildHostedBrandHeaderMarkup({ brandLabel, productLabel })}
    <main class="acme-auth-shell">
        <div class="acme-auth-intro">
            <p class="acme-auth-eyebrow" id="acme-auth-eyebrow">${productLabel}</p>
            <h1 class="acme-auth-title" id="acme-auth-title"></h1>
            <p class="acme-auth-subtitle" id="acme-auth-subtitle"></p>
        </div>
        <div class="acme-auth-guidance" id="acme-auth-guidance" aria-live="polite"></div>
        <div id="okta-login-container"></div>
        ${buildHostedSupportFooterMarkup({
          supportPhoneHref,
          supportPhone: escapeHtml(supportCopy.phone),
          supportHours: escapeHtml(supportCopy.hours),
          helpUrl,
          copyrightYear,
        })}
    </main>

    ${buildHostedThemeControllerScript(branding)}
    {{{OktaUtil}}}

    <script type="text/javascript" nonce="{{nonceValue}}">
        var copy = ${JSON.stringify(titleCopy)};
        var stateCopy = {
            signIn: {
                eyebrow: 'Customer sign in',
                title: copy.signInTitle,
                subtitle: copy.signInSubtitle,
                guidance: 'Use the same secure account for application progress, disclosures, and funding updates.'
            },
            signUp: {
                eyebrow: 'Account setup',
                title: copy.signUpTitle,
                subtitle: copy.signUpSubtitle,
                guidance: 'Registration includes contact verification and the security steps you will use later.'
            },
            enroll: {
                eyebrow: 'Security setup',
                title: 'Set up your verification methods',
                subtitle: 'Choose the verification methods that will protect future sign-in, account changes, and funding actions.',
                guidance: 'A few minutes here makes later sign-in and funding confirmation much smoother.'
            },
            verify: {
                eyebrow: 'Security verification',
                title: 'Verify your identity',
                subtitle: 'Complete the next security check so we can protect the account and keep the application moving.',
                guidance: 'We only ask for the next proof step needed for this session.'
            },
            recovery: {
                eyebrow: 'Account recovery',
                title: 'Recover secure access',
                subtitle: 'We will confirm it is really you before password reset or account recovery can continue.',
                guidance: 'Recovery checks help protect the account before access is restored.'
            },
            password: {
                eyebrow: 'Password update',
                title: 'Create a new password',
                subtitle: 'Choose a strong password so your future sign-in stays protected.',
                guidance: 'Use a password you do not reuse anywhere else.'
            }
        };

        function getRequestUrl() {
            return new URL(window.location.href);
        }

        function isSignupFlow() {
            return getRequestUrl().searchParams.get('screen_hint') === 'signup';
        }

        function normalizeText(value) {
            return (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        }

        function getWidgetHeadingText() {
            var heading = document.querySelector(
                '#okta-login-container .okta-form-title, #okta-login-container .siw-main-header h2, #okta-login-container .siw-main-header h3, #okta-login-container h2, #okta-login-container h3'
            );

            return heading ? heading.textContent.trim() : '';
        }

        function deriveExperienceState() {
            var widgetHeading = getWidgetHeadingText();
            var normalizedHeading = normalizeText(widgetHeading);

            if (normalizedHeading.indexOf('reset password') !== -1 ||
                normalizedHeading.indexOf('set password') !== -1 ||
                normalizedHeading.indexOf('create password') !== -1) {
                return { key: 'password', widgetHeading: widgetHeading };
            }

            if (normalizedHeading.indexOf('unlock account') !== -1 ||
                normalizedHeading.indexOf('recover') !== -1 ||
                normalizedHeading.indexOf('forgot password') !== -1) {
                return { key: 'recovery', widgetHeading: widgetHeading };
            }

            if (normalizedHeading.indexOf('select authenticator') !== -1 ||
                normalizedHeading.indexOf('enroll authenticator') !== -1 ||
                normalizedHeading.indexOf('set up') !== -1 ||
                normalizedHeading.indexOf('security method') !== -1) {
                return {
                    key: normalizedHeading.indexOf('verify') !== -1 ? 'verify' : 'enroll',
                    widgetHeading: widgetHeading
                };
            }

            if (normalizedHeading.indexOf('verify') !== -1 ||
                normalizedHeading.indexOf('challenge') !== -1 ||
                normalizedHeading.indexOf('passcode') !== -1 ||
                normalizedHeading.indexOf('enter code') !== -1 ||
                normalizedHeading.indexOf('push') !== -1 ||
                normalizedHeading.indexOf('approve') !== -1) {
                return { key: 'verify', widgetHeading: widgetHeading };
            }

            if (normalizedHeading.indexOf('create account') !== -1 ||
                normalizedHeading.indexOf('sign up') !== -1 ||
                normalizedHeading.indexOf('register') !== -1) {
                return { key: 'signUp', widgetHeading: widgetHeading };
            }

            if (isSignupFlow()) {
                return { key: 'signUp', widgetHeading: widgetHeading };
            }

            return { key: 'signIn', widgetHeading: widgetHeading };
        }

        function resolveStateCopy() {
            var state = deriveExperienceState();
            var nextCopy = stateCopy[state.key] || stateCopy.signIn;
            var nextTitle = nextCopy.title;

            if (state.widgetHeading && ['enroll', 'verify', 'recovery', 'password'].indexOf(state.key) !== -1) {
                nextTitle = state.widgetHeading;
            }

            return {
                key: state.key,
                eyebrow: nextCopy.eyebrow,
                title: nextTitle,
                subtitle: nextCopy.subtitle,
                guidance: nextCopy.guidance
            };
        }

        function updateExperienceCopy() {
            var nextCopy = resolveStateCopy();
            var eyebrow = document.getElementById('acme-auth-eyebrow');
            var title = document.getElementById('acme-auth-title');
            var subtitle = document.getElementById('acme-auth-subtitle');
            var guidance = document.getElementById('acme-auth-guidance');

            if (eyebrow) {
                eyebrow.textContent = nextCopy.eyebrow;
            }

            if (title) {
                title.textContent = nextCopy.title;
            }

            if (subtitle) {
                subtitle.textContent = nextCopy.subtitle;
            }

            if (guidance) {
                guidance.textContent = nextCopy.guidance || '';
            }

            document.body.setAttribute('data-acme-auth-state', nextCopy.key);
        }

        function getAuthenticatorTypeFromText(text) {
            var normalized = normalizeText(text);
            if (normalized.indexOf('password') !== -1) {
                return 'password';
            }
            if (normalized.indexOf('email') !== -1) {
                return 'email';
            }
            if (normalized.indexOf('phone') !== -1 || normalized.indexOf('sms') !== -1) {
                return 'phone';
            }
            return 'generic';
        }

        function getAuthenticatorGlyphMarkup(type) {
            if (type === 'password') {
                return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><rect x="5" y="10" width="14" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 13.75v2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
            }
            if (type === 'email') {
                return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="6.5" width="16" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="m5.5 8 6.5 5 6.5-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            }
            if (type === 'phone') {
                return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="7.25" y="3.5" width="9.5" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M10 6.5h4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="17.25" r="0.9" fill="currentColor"/></svg>';
            }
            return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4.5 6 7.25v4.1c0 3.55 2.48 6.85 6 7.65 3.52-.8 6-4.1 6-7.65v-4.1L12 4.5Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="m9.5 12 1.7 1.7 3.3-3.45" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        }

        function enhanceAuthenticatorOptions() {
            var items = document.querySelectorAll(
                '#okta-login-container .authenticator-enrollments-list li, #okta-login-container .authenticator-list li, #okta-login-container .authenticator-verify-list li'
            );

            Array.prototype.forEach.call(items, function(item) {
                var type = getAuthenticatorTypeFromText(item.textContent || '');

                item.classList.add('acme-authenticator-item');
                item.setAttribute('data-acme-authenticator', type);

                var action = item.querySelector('.button, button, input[type="button"], input[type="submit"]');
                if (action) {
                    action.classList.add('acme-authenticator-action');
                    if (action.parentElement && action.parentElement !== item) {
                        action.parentElement.classList.add('acme-authenticator-action-wrap');
                    }
                }

                var copyContainer =
                    item.querySelector('.select-authenticator-authenticate > :first-child, .authenticator-button > :first-child') ||
                    item.querySelector('.select-authenticator-label') ||
                    item.querySelector('h2, h3, h4, strong') ||
                    item.firstElementChild;

                if (copyContainer && copyContainer.nodeType === 1) {
                    copyContainer.classList.add('acme-authenticator-copy');
                }

                var badge = item.querySelector('.acme-authenticator-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'acme-authenticator-badge';
                    badge.innerHTML = getAuthenticatorGlyphMarkup(type);
                    item.insertBefore(badge, item.firstChild);
                } else {
                    badge.innerHTML = getAuthenticatorGlyphMarkup(type);
                }

                Array.prototype.forEach.call(
                    item.querySelectorAll(
                        'img, [class*="factor-icon"], [class*="authenticator-icon"], [class*="mfa-icon"], [data-se*="icon"]'
                    ),
                    function(node) {
                        if (!badge.contains(node) && node !== badge) {
                            node.style.display = 'none';
                        }
                    }
                );
            });
        }

        function enhanceRecoveryHints() {
            var currentState = resolveStateCopy().key;
            var container = document.querySelector('#okta-login-container .siw-main-body, #okta-login-container .auth-content-inner, #okta-login-container form');
            if (!container) {
                return;
            }

            var existingHints = container.querySelector('.acme-auth-hints');
            if (currentState !== 'recovery' && currentState !== 'password') {
                if (existingHints) {
                    existingHints.remove();
                }
                return;
            }

            if (!existingHints) {
                existingHints = document.createElement('div');
                existingHints.className = 'acme-auth-hints';
                existingHints.setAttribute('aria-label', 'Account recovery help');
                container.appendChild(existingHints);
            }

            existingHints.innerHTML = [
                '<section class="acme-auth-hint"><p class="acme-auth-hint__title">Forgot password?</p><p class="acme-auth-hint__body">Use your email verification code to reset access without calling support.</p></section>',
                '<section class="acme-auth-hint"><p class="acme-auth-hint__title">Changing email?</p><p class="acme-auth-hint__body">Sign in with the current email first, then update the profile after verification. Contact support if you no longer have mailbox access.</p></section>',
                '<section class="acme-auth-hint"><p class="acme-auth-hint__title">Changing phone number?</p><p class="acme-auth-hint__body">Use email recovery first, then replace the phone number from your profile once access is restored.</p></section>'
            ].join('');
        }

        function enhanceIdentifierContrast() {
            var candidates = document.querySelectorAll(
                '#okta-login-container p, #okta-login-container span, #okta-login-container strong, #okta-login-container b, #okta-login-container div'
            );

            Array.prototype.forEach.call(candidates, function(candidate) {
                var value = candidate.textContent || '';
                if (value.indexOf('@') === -1) {
                    return;
                }

                var descendantContainsIdentifier = Array.prototype.some.call(
                    candidate.children || [],
                    function(child) {
                        return (child.textContent || '').indexOf('@') !== -1;
                    }
                );

                if (!descendantContainsIdentifier) {
                    candidate.classList.add('acme-identifier-contrast');
                }
            });
        }

        function enhanceWidgetFooter() {
            var footer = document.querySelector('#okta-login-container .siw-main-footer');
            if (!footer) {
                return;
            }

            var currentState = resolveStateCopy().key;
            var footerLinks = Array.prototype.slice.call(footer.querySelectorAll('a'));
            var helpLink = footer.querySelector('.js-help') || footerLinks.find(function(link) {
                return normalizeText(link.textContent) === 'help';
            });
            if (helpLink) {
                if (currentState === 'signIn') {
                    helpLink.style.display = 'inline-flex';
                    helpLink.textContent = 'Forgot password or unlock account?';
                    helpLink.classList.add('acme-auth-recovery-link');
                } else {
                    helpLink.style.display = 'none';
                }
            }

            var registrationLink = footer.querySelector('.registration-link') || footerLinks.find(function(link) {
                var text = normalizeText(link.textContent);
                return text === 'sign up' || text === 'create account' || text === 'register';
            });
            if (!registrationLink) {
                return;
            }

            registrationLink.classList.add('acme-registration-link');

            var row = registrationLink.closest('.registration-container') || registrationLink.parentElement;
            if (!row) {
                return;
            }

            var promptText = currentState === 'signUp'
                ? 'Already have an account?'
                : 'Do not have an account?';
            var actionText = currentState === 'signUp'
                ? 'Sign in'
                : 'Sign up';

            row.classList.add('acme-registration-row');
            registrationLink.textContent = actionText;

            Array.prototype.slice.call(row.childNodes).forEach(function(node) {
                if (node !== registrationLink) {
                    row.removeChild(node);
                }
            });

            if (registrationLink.parentElement !== row) {
                row.appendChild(registrationLink);
            }

            var promptNode = row.querySelector('.acme-registration-prompt');
            if (!promptNode) {
                promptNode = document.createElement('span');
                promptNode.className = 'acme-registration-prompt';
                row.insertBefore(promptNode, registrationLink);
            }

            promptNode.textContent = promptText;
        }

        function syncHostedExperience() {
            updateExperienceCopy();
            enhanceAuthenticatorOptions();
            enhanceRecoveryHints();
            enhanceIdentifierContrast();
            enhanceWidgetFooter();
        }

        function observeWidgetUpdates() {
            var container = document.getElementById('okta-login-container');
            if (!container || typeof MutationObserver === 'undefined') {
                return;
            }

            var pendingFrame = 0;
            var scheduleSync = function() {
                if (pendingFrame) {
                    return;
                }

                pendingFrame = window.requestAnimationFrame
                    ? window.requestAnimationFrame(function() {
                        pendingFrame = 0;
                        syncHostedExperience();
                    })
                    : window.setTimeout(function() {
                        pendingFrame = 0;
                        syncHostedExperience();
                    }, 0);
            };

            var observer = new MutationObserver(scheduleSync);
            observer.observe(container, {
                childList: true,
                subtree: true,
                attributes: true
            });
        }

        var config = OktaUtil.getSignInWidgetConfig();
        config.features = Object.assign({}, config.features || {}, {
            rememberMe: true
        });
        config.i18n = Object.assign({}, config.i18n || {}, {
            en: Object.assign({}, config.i18n && config.i18n.en ? config.i18n.en : {}, {
                'primaryauth.remember': 'Remember me',
                'remember': 'Remember me'
            })
        });
        syncHostedExperience();
        observeWidgetUpdates();

        var oktaSignIn = new OktaSignIn(config);
        oktaSignIn.renderEl({ el: '#okta-login-container' },
            OktaUtil.completeLogin,
            function(error) {
                console.log(error.message, error);
            }
        );
    </script>
</body>
</html>
`;
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

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex,nofollow" />
    <title>{{orgName}} - {{errorSummary}}</title>
    <link href="{{themedStylesUrl}}" rel="stylesheet" type="text/css">
    <link rel="shortcut icon" href="{{faviconUrl}}" type="image/x-icon"/>
    {{{ErrorPageResources}}}
    ${buildHostedThemeBootstrapScript(branding)}
    <style nonce="{{nonceValue}}">
        ${themeCss}

        html, body {
            min-height: 100%;
            max-width: 100%;
            overflow-x: clip;
        }

        *, *::before, *::after {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 0;
            color: var(--acme-text);
            background:
                radial-gradient(ellipse at top right, var(--acme-hero-glow-top) 0%, transparent 68%),
                radial-gradient(ellipse at top left, var(--acme-hero-glow-side) 0%, transparent 72%),
                linear-gradient(
                    180deg,
                    var(--acme-background-top) 0%,
                    var(--acme-background) 24%,
                    var(--acme-background) 100%
                );
            background-position:
                top right,
                top left,
                top left;
            background-repeat: no-repeat;
            background-size:
                var(--acme-hero-glow-top-size),
                var(--acme-hero-glow-side-size),
                100% 100%;
            font-family: var(--acme-font-body);
        }

        #login-bg-image-id {
            background-image: {{bgImageUrl}};
        }

        .acme-brand-header {
            position: relative;
            z-index: 1;
            border-bottom: 1px solid var(--acme-border);
            background: var(--acme-surface);
            box-shadow: var(--acme-header-shadow);
        }

        .acme-brand-header__inner {
            width: 100%;
            max-width: 72rem;
            margin: 0 auto;
            padding: 0.65rem 1.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }

        .acme-brand-header__lockup {
            display: inline-flex;
            align-items: center;
            gap: 0.9rem;
            min-width: 0;
        }

        .acme-brand-header__mark {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 2.5rem;
            height: 2.5rem;
            border-radius: 1rem;
            flex-shrink: 0;
            background: var(--acme-brand);
            box-shadow: 0 12px 24px var(--acme-brand-shadow);
        }

        .acme-brand-header__mark svg {
            width: 1.16rem;
            height: 1.16rem;
            display: block;
        }

        .acme-brand-header__copy {
            display: inline-flex;
            flex-direction: column;
            min-width: 0;
        }

        .acme-brand-header__eyebrow {
            color: var(--acme-muted-text);
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.2em;
            text-transform: uppercase;
        }

        .acme-brand-header__title {
            color: var(--acme-text);
            font-family: var(--acme-font-display);
            font-size: 1.22rem;
            line-height: 1.05;
        }

        .acme-theme-toggle {
            display: inline-flex;
            align-items: center;
            gap: 0.15rem;
            padding: 0.18rem;
            border: 1px solid var(--acme-border);
            border-radius: 999px;
            background: var(--acme-surface-strong);
            flex-shrink: 0;
        }

        .acme-theme-toggle__button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 1.82rem;
            height: 1.82rem;
            border: 0;
            border-radius: 999px;
            background: transparent;
            color: var(--acme-muted-text);
            cursor: pointer;
        }

        .acme-theme-toggle__button[aria-pressed='true'] {
            background: var(--acme-brand);
            color: var(--acme-brand-contrast);
        }

        .acme-theme-toggle__button svg {
            width: 0.92rem;
            height: 0.92rem;
            display: block;
        }

        .acme-error-shell {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 31rem;
            margin: 0 auto;
            padding: 1.35rem 1rem 1.15rem;
        }

        .acme-error-card {
            background: linear-gradient(
                180deg,
                var(--acme-card) 0%,
                var(--acme-surface) 100%
            );
            border: 1px solid var(--acme-border);
            border-radius: 1.55rem;
            box-shadow: var(--acme-card-shadow);
            padding: 1.35rem;
        }

        .acme-error-eyebrow {
            margin: 0 0 0.75rem;
            color: var(--acme-muted-text);
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.22em;
            text-transform: uppercase;
        }

        .acme-error-title {
            margin: 0;
            color: var(--acme-text);
            font-size: 1.55rem;
            line-height: 1.08;
            font-family: var(--acme-font-display);
        }

        .acme-error-body {
            margin: 1rem 0 0;
            color: var(--acme-muted-text);
            font-size: 0.92rem;
            line-height: 1.55;
        }

        .acme-error-actions {
            margin-top: 1.5rem;
        }

        .acme-error-actions a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 2.42rem;
            padding: 0 1rem;
            border-radius: 1rem;
            background: var(--acme-brand);
            color: var(--acme-brand-contrast);
            font-weight: 700;
            text-decoration: none;
        }

        .acme-error-actions a:focus-visible {
            outline: 2px solid var(--acme-focus);
            outline-offset: 3px;
        }

        .acme-error-accent {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 1rem;
            color: var(--acme-accent);
            font-size: 0.9rem;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
        }

        .acme-auth-copyright {
            margin: 0.15rem 0 0;
            text-align: center;
            color: var(--acme-muted-text);
            font-size: 0.82rem;
            line-height: 1.55;
        }

        .acme-auth-footer {
            width: 100%;
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid var(--acme-border);
            text-align: center;
        }

        .acme-auth-support {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 0.35rem 0.55rem;
            color: var(--acme-muted-text);
            font-size: 0.9rem;
            line-height: 1.55;
            text-align: center;
        }

        .acme-auth-support a {
            color: var(--acme-link);
            font-weight: 600;
            text-decoration: none;
        }

        .acme-auth-support a:hover {
            text-decoration: underline;
        }

        .acme-auth-support a:focus-visible {
            outline: 2px solid var(--acme-focus);
            outline-offset: 3px;
            border-radius: 0.25rem;
        }

        .acme-auth-support__divider {
            color: var(--acme-border-strong);
        }

        @media (max-width: 640px) {
            .acme-brand-header__inner {
                padding: 0.85rem 1rem;
            }

            .acme-brand-header__title {
                font-size: 1.3rem;
            }

            .acme-error-shell {
                max-width: 100%;
                padding: 1.45rem 0.95rem 1.15rem;
            }

            .acme-error-card {
                padding: 1.35rem;
            }

            .acme-error-title {
                font-size: 1.65rem;
            }

            .acme-auth-support {
                flex-direction: column;
                gap: 0.25rem;
            }

            .acme-auth-support__divider {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div id="login-bg-image-id" class="login-bg-image tb--background"></div>
    ${buildHostedBrandHeaderMarkup({ brandLabel, productLabel: productName })}
    <main class="acme-error-shell">
        <section class="acme-error-card">
            <p class="acme-error-eyebrow">${productName}</p>
            <div class="acme-error-accent">Secure access issue</div>
            <h1 class="acme-error-title">{{errorSummary}}</h1>
            <p class="acme-error-body">{{{errorDescription}}}</p>
            <div class="acme-error-actions">
                <a href="{{buttonHref}}">{{buttonText}}</a>
            </div>
        </section>
        ${buildHostedSupportFooterMarkup({
          supportPhoneHref,
          supportPhone,
          supportHours,
          helpUrl: requiredString(branding.HelpUrl, 'Branding.HelpUrl'),
          copyrightYear,
        })}
    </main>
    ${buildHostedThemeControllerScript(branding)}
</body>
</html>
`;
}
