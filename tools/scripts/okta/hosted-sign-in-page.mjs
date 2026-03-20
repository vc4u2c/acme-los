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
            <span class="acme-brand-header__pill">Customer access</span>
        </div>
    </header>
  `;
}

function buildHostedCopyrightMarkup(year) {
  return `<p class="acme-auth-copyright">© ${year} ACME LOS. All rights reserved.</p>`;
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
            --acme-card-shadow: 0 24px 60px rgba(10, 24, 20, 0.12);
            --acme-font-display: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
            --acme-font-body: Aptos, 'Segoe UI Variable Display', 'Segoe UI', sans-serif;
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

  const flowCopy = {
    signInPrompt: 'New here?',
    signInAction: 'Create account',
    signUpPrompt: 'Already have an account?',
    signUpAction: 'Sign in',
  };

  const supportCopy = {
    label: 'Need help?',
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
                radial-gradient(circle at top right, var(--acme-hero-glow-top), transparent 28%),
                radial-gradient(circle at top left, var(--acme-hero-glow-side), transparent 24%),
                linear-gradient(
                    180deg,
                    var(--acme-background-top) 0%,
                    var(--acme-background) 22%,
                    var(--acme-background) 100%
                );
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
            padding: 0.9rem 1.5rem;
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
            width: 2.9rem;
            height: 2.9rem;
            border-radius: 1rem;
            flex-shrink: 0;
            background: var(--acme-brand);
            box-shadow: 0 18px 34px var(--acme-brand-shadow);
        }

        .acme-brand-header__mark svg {
            width: 1.35rem;
            height: 1.35rem;
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
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.22em;
            text-transform: uppercase;
        }

        .acme-brand-header__title {
            color: var(--acme-text);
            font-family: var(--acme-font-display);
            font-size: 1.55rem;
            line-height: 1.05;
        }

        .acme-brand-header__pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 2rem;
            padding: 0 0.9rem;
            border: 1px solid var(--acme-border);
            border-radius: 999px;
            background: var(--acme-surface-strong);
            color: var(--acme-muted-text);
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            white-space: nowrap;
        }

        .acme-auth-shell {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 30rem;
            margin: 0 auto;
            padding: 1.75rem 1.25rem 1.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow-x: clip;
        }

        .acme-auth-intro {
            margin: 0 0 1rem;
            text-align: center;
            width: 100%;
        }

        .acme-auth-eyebrow {
            margin: 0 0 0.75rem;
            color: var(--acme-muted-text);
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.22em;
            text-transform: uppercase;
        }

        .acme-auth-title {
            margin: 0;
            color: var(--acme-text);
            font-size: 1.9rem;
            line-height: 1.12;
            font-family: var(--acme-font-display);
        }

        .acme-auth-subtitle {
            margin: 0.7rem 0 0;
            color: var(--acme-muted-text);
            font-size: 0.98rem;
            line-height: 1.6;
        }

        .acme-auth-guidance {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            margin: 0.75rem 0 1rem;
            padding: 0.72rem 0.95rem;
            border: 1px solid var(--acme-border);
            border-radius: 1rem;
            background: var(--acme-guidance-bg);
            color: var(--acme-muted-text);
            font-size: 0.9rem;
            line-height: 1.55;
            text-align: center;
        }

        .acme-auth-secondary-link,
        .acme-auth-support {
            margin-top: 0.9rem;
            text-align: center;
            color: var(--acme-muted-text);
            font-size: 0.9rem;
            line-height: 1.55;
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
            border-radius: 1.8rem;
            background: var(--acme-card);
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

        #okta-login-container .auth-content {
            padding: 1.5rem 1.5rem 0 !important;
        }

        #okta-login-container .siw-main-view {
            margin: 0 !important;
            padding: 0 !important;
        }

        #okta-login-container .siw-main-footer {
            padding: 0 1.5rem 1.5rem !important;
            border-top: 1px solid var(--acme-border);
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 0.75rem !important;
        }

        #okta-login-container .siw-main-footer > * {
            width: auto !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
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
            text-align: left !important;
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
            font-size: 1.55rem !important;
            line-height: 1.12 !important;
        }

        #okta-login-container .o-form-head,
        #okta-login-container .siw-form-header,
        #okta-login-container .siw-main-header {
            margin-bottom: 1rem !important;
            padding: 0 !important;
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
            min-height: 3rem !important;
            border: 1px solid var(--acme-border) !important;
            border-radius: 1rem !important;
            background: var(--acme-field-bg) !important;
            color: var(--acme-text) !important;
            box-shadow: none !important;
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
            min-height: 3rem !important;
            border-radius: 1rem !important;
            border: 1px solid var(--acme-border) !important;
            background: var(--acme-field-bg) !important;
            color: var(--acme-text) !important;
            box-shadow: none !important;
            font-size: 0.98rem !important;
            font-weight: 700 !important;
            padding: 0.72rem 1.1rem !important;
            transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, filter 120ms ease;
        }

        #okta-login-container .button-primary,
        #okta-login-container .button.button-primary,
        #okta-login-container input[type="submit"] {
            min-height: 3rem !important;
            border-radius: 999px !important;
            border: 0 !important;
            background: var(--acme-brand) !important;
            color: var(--acme-brand-contrast) !important;
            box-shadow: none !important;
            font-size: 0.98rem !important;
            font-weight: 700 !important;
            padding: 0.78rem 1.35rem !important;
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
            border-radius: 1.2rem !important;
            border-color: var(--acme-border) !important;
            background: var(--acme-field-bg) !important;
        }

        #okta-login-container .authenticator-button,
        #okta-login-container .okta-form-subsection,
        #okta-login-container .siw-enroll-card,
        #okta-login-container .authenticator-enrollments-list li {
            padding: 1rem !important;
        }

        #okta-login-container .authenticator-enrollments-list li,
        #okta-login-container .authenticator-list li,
        #okta-login-container .authenticator-verify-list li {
            list-style: none !important;
            width: 100% !important;
            max-width: 100% !important;
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
            min-width: 5.6rem !important;
            min-height: 2.5rem !important;
            width: auto !important;
            align-self: center !important;
            justify-content: center !important;
            border-radius: 1rem !important;
            padding: 0.58rem 0.9rem !important;
            background: var(--acme-brand) !important;
            color: var(--acme-brand-contrast) !important;
            border: 0 !important;
            white-space: nowrap !important;
            font-size: 0.92rem !important;
            line-height: 1.1 !important;
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
            margin: 0 auto 0.5rem !important;
        }

        #okta-login-container .beacon,
        #okta-login-container .mfa-verify-passcode .beacon,
        #okta-login-container .authenticator-verify-list .beacon {
            border-color: var(--acme-border) !important;
            background: var(--acme-field-bg) !important;
        }

        .acme-auth-copyright {
            margin: 1rem 0 0;
            text-align: center;
            color: var(--acme-muted-text);
            font-size: 0.82rem;
            line-height: 1.55;
        }

        .acme-auth-secondary-link a,
        .acme-auth-support a {
            color: var(--acme-link);
            font-weight: 600;
            text-decoration: none;
        }

        .acme-auth-secondary-link a:hover,
        .acme-auth-support a:hover {
            text-decoration: underline;
        }

        .acme-auth-secondary-link a:focus-visible,
        .acme-auth-support a:focus-visible {
            outline: 2px solid var(--acme-focus);
            outline-offset: 3px;
            border-radius: 0.25rem;
        }

        @media (max-width: 640px) {
            .acme-auth-shell {
                padding: 1.4rem 0.9rem 1.2rem;
            }

            .acme-brand-header__inner {
                padding: 0.85rem 1rem;
                flex-wrap: wrap;
                align-items: flex-start;
            }

            .acme-brand-header__title {
                font-size: 1.3rem;
            }

            .acme-brand-header__pill {
                display: none;
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
                padding: 1.15rem 1rem 0 !important;
            }

            #okta-login-container .siw-main-footer {
                padding: 0 1rem 1.15rem !important;
            }

            #okta-login-container .okta-form-title,
            #okta-login-container h2,
            #okta-login-container h3 {
                font-size: 1.35rem !important;
            }

            #okta-login-container .select-authenticator-authenticate,
            #okta-login-container .authenticator-button {
                grid-template-columns: 1fr !important;
                gap: 0.8rem !important;
                padding: 0.9rem !important;
            }

            #okta-login-container .select-authenticator-authenticate .button,
            #okta-login-container .authenticator-button .button,
            #okta-login-container .authenticator-enrollments-list li .button {
                width: 100% !important;
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
        <div class="acme-auth-secondary-link" id="acme-auth-secondary-link" aria-live="polite"></div>
        <div class="acme-auth-support">
            Need help? <a href="${supportPhoneHref}">${escapeHtml(
              supportCopy.phone,
            )}</a> <span>${escapeHtml(supportCopy.hours)}</span>
        </div>
        ${buildHostedCopyrightMarkup(copyrightYear)}
    </main>

    {{{OktaUtil}}}

    <script type="text/javascript" nonce="{{nonceValue}}">
        var copy = ${JSON.stringify(titleCopy)};
        var flowCopy = ${JSON.stringify(flowCopy)};
        var helpUrl = ${JSON.stringify(helpUrl)};
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
        var secondaryStateCopy = {
            signIn: {
                prompt: flowCopy.signInPrompt + ' ',
                action: flowCopy.signInAction,
                href: buildFlowUrl('signup')
            },
            signUp: {
                prompt: flowCopy.signUpPrompt + ' ',
                action: flowCopy.signUpAction,
                href: buildFlowUrl('')
            },
            enroll: null,
            verify: null,
            recovery: null,
            password: null
        };

        function getRequestUrl() {
            return new URL(window.location.href);
        }

        function isSignupFlow() {
            return getRequestUrl().searchParams.get('screen_hint') === 'signup';
        }

        function buildFlowUrl(screenHint) {
            var url = getRequestUrl();
            if (screenHint) {
                url.searchParams.set('screen_hint', screenHint);
            } else {
                url.searchParams.delete('screen_hint');
            }
            return url.toString();
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

        function renderSecondaryLink() {
            var state = resolveStateCopy();
            var container = document.getElementById('acme-auth-secondary-link');
            if (!container) {
                return;
            }

            container.textContent = '';
            container.style.display = 'none';

            var secondaryCopy = secondaryStateCopy[state.key];
            if (!secondaryCopy) {
                return;
            }

            container.style.display = 'block';

            var prompt = document.createElement('span');
            prompt.textContent = secondaryCopy.prompt;

            var link = document.createElement('a');
            link.href = secondaryCopy.href;
            link.textContent = secondaryCopy.action;

            container.appendChild(prompt);
            container.appendChild(link);
        }

        function syncHostedExperience() {
            updateExperienceCopy();
            renderSecondaryLink();
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
                radial-gradient(circle at top right, var(--acme-hero-glow-top), transparent 28%),
                radial-gradient(circle at top left, var(--acme-hero-glow-side), transparent 24%),
                linear-gradient(
                    180deg,
                    var(--acme-background-top) 0%,
                    var(--acme-background) 24%,
                    var(--acme-background) 100%
                );
            font-family: var(--acme-font-body);
        }

        #login-bg-image-id {
            background-image: {{bgImageUrl}};
        }

        .acme-brand-header {
            position: relative;
            z-index: 1;
            border-bottom: 1px solid var(--acme-border);
            background: color-mix(in srgb, var(--acme-surface) 92%, transparent);
            box-shadow: var(--acme-header-shadow);
        }

        .acme-brand-header__inner {
            width: 100%;
            max-width: 72rem;
            margin: 0 auto;
            padding: 0.9rem 1.5rem;
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
            width: 2.9rem;
            height: 2.9rem;
            border-radius: 1rem;
            flex-shrink: 0;
            background: var(--acme-brand);
            box-shadow: 0 18px 34px var(--acme-brand-shadow);
        }

        .acme-brand-header__mark svg {
            width: 1.35rem;
            height: 1.35rem;
            display: block;
        }

        .acme-brand-header__copy {
            display: inline-flex;
            flex-direction: column;
            min-width: 0;
        }

        .acme-brand-header__eyebrow {
            color: var(--acme-muted-text);
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.22em;
            text-transform: uppercase;
        }

        .acme-brand-header__title {
            color: var(--acme-text);
            font-family: var(--acme-font-display);
            font-size: 1.55rem;
            line-height: 1.05;
        }

        .acme-brand-header__pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 2rem;
            padding: 0 0.9rem;
            border: 1px solid var(--acme-border);
            border-radius: 999px;
            background: var(--acme-surface-strong);
            color: var(--acme-muted-text);
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            white-space: nowrap;
        }

        .acme-error-shell {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 40rem;
            margin: 0 auto;
            padding: 2.5rem 1.5rem 2rem;
        }

        .acme-error-card {
            background: var(--acme-surface);
            border: 1px solid var(--acme-border);
            border-radius: 1.75rem;
            box-shadow: var(--acme-card-shadow);
            padding: 2rem;
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
            font-size: 2rem;
            line-height: 1.08;
            font-family: var(--acme-font-display);
        }

        .acme-error-body {
            margin: 1rem 0 0;
            color: var(--acme-muted-text);
            font-size: 1rem;
            line-height: 1.7;
        }

        .acme-error-actions {
            margin-top: 1.5rem;
        }

        .acme-error-actions a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 2.75rem;
            padding: 0 1rem;
            border-radius: 999px;
            background: var(--acme-brand);
            color: var(--acme-brand-contrast);
            font-weight: 600;
            text-decoration: none;
        }

        .acme-error-actions a:focus-visible {
            outline: 2px solid var(--acme-focus);
            outline-offset: 3px;
        }

        .acme-error-support {
            margin-top: 1.25rem;
            color: var(--acme-muted-text);
            font-size: 0.95rem;
            line-height: 1.6;
        }

        .acme-error-support a {
            color: var(--acme-link);
            font-weight: 600;
            text-decoration: none;
        }

        .acme-error-support a:hover {
            text-decoration: underline;
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
            margin: 1rem 0 0;
            text-align: center;
            color: var(--acme-muted-text);
            font-size: 0.82rem;
            line-height: 1.55;
        }

        @media (max-width: 640px) {
            .acme-brand-header__inner {
                padding: 0.85rem 1rem;
            }

            .acme-brand-header__title {
                font-size: 1.3rem;
            }

            .acme-brand-header__pill {
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
            <div class="acme-error-support">
                Need help? <a href="${supportPhoneHref}">${supportPhone}</a><br />
                ${supportHours}
            </div>
            ${buildHostedCopyrightMarkup(copyrightYear)}
        </section>
    </main>
</body>
</html>
`;
}
