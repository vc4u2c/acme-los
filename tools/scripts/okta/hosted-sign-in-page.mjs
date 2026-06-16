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

function assertNoHostedPagePlaceholders(content, fileName) {
  const unresolvedPlaceholders = content.match(hostedPagePlaceholderPattern);
  if (unresolvedPlaceholders) {
    throw new Error(
      `Unresolved Okta hosted page template placeholders in ${fileName}: ${[
        ...new Set(unresolvedPlaceholders),
      ].join(', ')}`,
    );
  }
}

function readHostedPagePartial(partialFileName) {
  const partialPath = path.join(hostedPageTemplateDirectory, partialFileName);
  return fs.readFileSync(partialPath, 'utf8').trimEnd();
}

function renderHostedPagePartial(partialFileName, replacements = {}) {
  const content = replaceHostedPagePlaceholders(
    readHostedPagePartial(partialFileName),
    replacements,
  );

  assertNoHostedPagePlaceholders(content, partialFileName);

  return content;
}

function renderHostedPageTemplate(templateFileName, replacements) {
  const templatePath = path.join(hostedPageTemplateDirectory, templateFileName);
  const content = replaceHostedPagePlaceholders(
    fs.readFileSync(templatePath, 'utf8'),
    replacements,
  );

  assertNoHostedPagePlaceholders(content, templateFileName);

  return content;
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

function requiredAbsoluteHttpUrl(value, fieldName) {
  const url = new URL(requiredString(value, fieldName));

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Expected "${fieldName}" to be an HTTP(S) URL.`);
  }

  return url.toString();
}

export function buildHostedSignInStartUrl(
  webBaseUrl,
  fieldName = 'web.deployedBaseUrl',
) {
  const url = new URL(
    '/api/auth/start',
    requiredAbsoluteHttpUrl(webBaseUrl, fieldName),
  );

  url.searchParams.set('returnTo', '/account/profile');

  return url.toString();
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

function buildHostedThemeCss(branding) {
  return renderHostedPagePartial('hosted-theme.css', {
    PRIMARY_COLOR: requiredString(
      branding.PrimaryColor,
      'Branding.PrimaryColor',
    ),
    PRIMARY_CONTRAST_COLOR: requiredString(
      branding.PrimaryContrastColor,
      'Branding.PrimaryContrastColor',
    ),
    BACKGROUND_COLOR: requiredString(
      branding.BackgroundColor,
      'Branding.BackgroundColor',
    ),
    SURFACE_COLOR: requiredString(
      branding.SurfaceColor,
      'Branding.SurfaceColor',
    ),
    TEXT_COLOR: requiredString(branding.TextColor, 'Branding.TextColor'),
    MUTED_TEXT_COLOR: requiredString(
      branding.MutedTextColor,
      'Branding.MutedTextColor',
    ),
    LINK_COLOR: requiredString(branding.LinkColor, 'Branding.LinkColor'),
    BORDER_COLOR: requiredString(branding.BorderColor, 'Branding.BorderColor'),
    FOCUS_COLOR: requiredString(branding.FocusColor, 'Branding.FocusColor'),
    ACCENT_COLOR: requiredString(branding.AccentColor, 'Branding.AccentColor'),
  });
}

function buildHostedSignInShellCss() {
  return readHostedPagePartial('hosted-sign-in-page.css');
}

function buildHostedThemeStyleMarkup(themeCss) {
  return renderHostedPagePartial('hosted-style-tag.html', {
    THEME_CSS: themeCss,
  });
}

function buildHostedThemeBootstrapScript(branding) {
  return renderHostedPagePartial('hosted-theme-bootstrap-script.html', {
    THEME_COOKIE_DOMAIN_JSON: JSON.stringify(
      resolveThemeCookieDomain(branding),
    ),
  });
}

function buildHostedThemeControllerScript(branding) {
  return renderHostedPagePartial('hosted-theme-controller-script.html', {
    THEME_COOKIE_DOMAIN_JSON: JSON.stringify(
      resolveThemeCookieDomain(branding),
    ),
  });
}

function buildHostedBrandHeaderMarkup({ brandLabel, productLabel }) {
  return renderHostedPagePartial('hosted-brand-header.html', {
    BRAND_LABEL: brandLabel,
    PRODUCT_LABEL: productLabel,
  });
}

function buildHostedSupportFooterMarkup({
  supportPhoneHref,
  supportPhone,
  supportHours,
  helpUrl,
  copyrightYear,
}) {
  return renderHostedPagePartial('hosted-support-footer.html', {
    HELP_URL: escapeHtml(helpUrl),
    SUPPORT_PHONE_HREF: supportPhoneHref,
    SUPPORT_PHONE: supportPhone,
    SUPPORT_HOURS: supportHours,
    COPYRIGHT_YEAR: copyrightYear,
  });
}

function buildCommonHostedPageParts(branding) {
  const brandLabel = deriveBrandLabel(branding);
  const productLabel = escapeHtml(
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

  return {
    brandLabel,
    productLabel,
    themeBootstrapScript: buildHostedThemeBootstrapScript(branding),
    themeControllerScript: buildHostedThemeControllerScript(branding),
    brandHeaderMarkup: buildHostedBrandHeaderMarkup({
      brandLabel,
      productLabel,
    }),
    supportFooterMarkup: buildHostedSupportFooterMarkup({
      supportPhoneHref,
      supportPhone,
      supportHours,
      helpUrl: requiredString(branding.HelpUrl, 'Branding.HelpUrl'),
      copyrightYear: new Date().getFullYear(),
    }),
  };
}

export function buildHostedSignInPageContent(branding) {
  const common = buildCommonHostedPageParts(branding);
  const signInTitle = escapeHtml(
    requiredString(branding.SignInTitle, 'Branding.SignInTitle'),
  );
  const signInSubtitle = escapeHtml(
    requiredString(branding.SignInSubtitle, 'Branding.SignInSubtitle'),
  );
  const themeCss = `${buildHostedThemeCss(branding)}\n${buildHostedSignInShellCss()}`;

  return renderHostedPageTemplate('hosted-sign-in-page.html', {
    THEME_BOOTSTRAP_SCRIPT: common.themeBootstrapScript,
    THEME_STYLE_MARKUP: buildHostedThemeStyleMarkup(themeCss),
    BRAND_HEADER_MARKUP: common.brandHeaderMarkup,
    SIGN_IN_TITLE: signInTitle,
    SIGN_IN_SUBTITLE: signInSubtitle,
    SIGN_IN_START_URL: escapeHtml(
      requiredAbsoluteHttpUrl(
        branding.SignInStartUrl,
        'Branding.SignInStartUrl',
      ),
    ),
    SUPPORT_FOOTER_MARKUP: common.supportFooterMarkup,
    THEME_CONTROLLER_SCRIPT: common.themeControllerScript,
    HOSTED_SIGN_IN_CONTROLLER: readHostedPagePartial(
      'hosted-sign-in-page.controller.js',
    ),
  });
}

export function buildHostedErrorPageContent(branding) {
  const common = buildCommonHostedPageParts(branding);

  return renderHostedPageTemplate('hosted-error-page.html', {
    THEME_BOOTSTRAP_SCRIPT: common.themeBootstrapScript,
    THEME_STYLE_MARKUP: buildHostedThemeStyleMarkup(
      buildHostedThemeCss(branding),
    ),
    BRAND_HEADER_MARKUP: buildHostedBrandHeaderMarkup({
      brandLabel: common.brandLabel,
      productLabel: escapeHtml(
        requiredString(branding.ProductName, 'Branding.ProductName'),
      ),
    }),
    PRODUCT_NAME: common.productLabel,
    SIGN_IN_START_URL: escapeHtml(
      requiredAbsoluteHttpUrl(
        branding.SignInStartUrl,
        'Branding.SignInStartUrl',
      ),
    ),
    SUPPORT_FOOTER_MARKUP: common.supportFooterMarkup,
    THEME_CONTROLLER_SCRIPT: common.themeControllerScript,
  });
}
