import { getAnalyticsRuntimeConfig } from '../src/lib/analytics/config';
import { buildAnalyticsBootstrapScript } from '../src/components/web/analytics/analytics-scripts';
import {
  buildPageViewEvent,
  getAnalyticsRenderingMode,
  getAnalyticsRouteGroup,
  pushAnalyticsEvent,
} from '../src/lib/analytics/data-layer';

describe('analytics runtime config', () => {
  it('stays disabled until explicitly enabled', () => {
    expect(getAnalyticsRuntimeConfig({}).enabled).toBe(false);
  });

  it('uses GTM when both GTM and GA4 identifiers are present', () => {
    const config = getAnalyticsRuntimeConfig({
      NEXT_PUBLIC_ACME_ANALYTICS_ENABLED: 'true',
      NEXT_PUBLIC_ACME_ANALYTICS_ENVIRONMENT: 'dev',
      NEXT_PUBLIC_ACME_GTM_CONTAINER_ID: 'gtm-test123',
      NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID: 'g-test123',
      NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_ANALYTICS_STORAGE: 'granted',
    });

    expect(config).toMatchObject({
      enabled: true,
      environment: 'dev',
      mode: 'gtm',
      gtmContainerId: 'GTM-TEST123',
      ga4MeasurementId: 'G-TEST123',
      consent: {
        analyticsStorage: 'granted',
        adStorage: 'denied',
      },
    });
  });

  it('falls back to direct gtag mode when only GA4 is configured', () => {
    const config = getAnalyticsRuntimeConfig({
      NEXT_PUBLIC_ACME_ANALYTICS_ENABLED: 'true',
      NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID: 'G-ABC123',
    });

    expect(config.enabled).toBe(true);
    expect(config.mode).toBe('gtag');
  });

  it('does not enable analytics for invalid identifiers', () => {
    const config = getAnalyticsRuntimeConfig({
      NEXT_PUBLIC_ACME_ANALYTICS_ENABLED: 'true',
      NEXT_PUBLIC_ACME_GTM_CONTAINER_ID: 'replace-me',
      NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID: 'replace-me',
    });

    expect(config.enabled).toBe(false);
    expect(config.disabledReason).toBe('missing-google-id');
  });

  it('configures GA4 without auto page views when GTM mode is active', () => {
    const script = buildAnalyticsBootstrapScript(
      getAnalyticsRuntimeConfig({
        NEXT_PUBLIC_ACME_ANALYTICS_ENABLED: 'true',
        NEXT_PUBLIC_ACME_GTM_CONTAINER_ID: 'GTM-TEST123',
        NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID: 'G-ABC123',
      }),
    );

    expect(script).toContain("gtag('js', new Date());");
    expect(script).toContain('gtag(\'config\', "G-ABC123"');
    expect(script).toContain('"send_page_view":false');
  });
});

describe('analytics data layer contract', () => {
  it.each([
    ['/', 'home', 'static'],
    ['/apply/personal-info', 'application', 'server'],
    ['/account/profile', 'account', 'server'],
    ['/rendering-demo/client', 'rendering-demo', 'client'],
    ['/rendering-demo/isr', 'rendering-demo', 'isr'],
    ['/legal/privacy', 'legal', 'static'],
  ])('classifies %s', (pathname, routeGroup, renderingMode) => {
    expect(getAnalyticsRouteGroup(pathname)).toBe(routeGroup);
    expect(getAnalyticsRenderingMode(pathname)).toBe(renderingMode);
  });

  it('builds page_view events without query strings or PII', () => {
    const config = getAnalyticsRuntimeConfig({
      NEXT_PUBLIC_ACME_ANALYTICS_ENABLED: 'true',
      NEXT_PUBLIC_ACME_GTM_CONTAINER_ID: 'GTM-TEST123',
      NEXT_PUBLIC_ACME_ANALYTICS_ENVIRONMENT: 'qa',
    });

    const event = buildPageViewEvent({
      config,
      pathname: '/apply/personal-info',
      pageTitle: 'Apply',
      origin: 'https://example.test',
      authState: 'authenticated',
      assuranceLevel: 'aal1',
    });

    expect(event).toMatchObject({
      event: 'page_view',
      environment: 'qa',
      page_location: 'https://example.test/apply/personal-info',
      page_path: '/apply/personal-info',
      route_group: 'application',
      rendering_mode: 'server',
      auth_state: 'authenticated',
      assurance_level: 'aal1',
      journey_name: 'loan_application',
      application_step: 'personal-info',
    });
    expect(event.event_id).toEqual(expect.any(String));
    expect(JSON.stringify(event)).not.toContain('@');
  });

  it('pushes direct gtag events only in gtag mode', () => {
    const event = buildPageViewEvent({
      config: getAnalyticsRuntimeConfig({
        NEXT_PUBLIC_ACME_ANALYTICS_ENABLED: 'true',
        NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID: 'G-ABC123',
      }),
      pathname: '/',
      pageTitle: 'Home',
      origin: 'https://example.test',
      authState: 'anonymous',
      assuranceLevel: 'anonymous',
    });
    const gtag = jest.fn();

    window.dataLayer = [];
    window.gtag = gtag;

    pushAnalyticsEvent(event, { mode: 'gtm' });
    expect(gtag).not.toHaveBeenCalled();

    pushAnalyticsEvent(event, { mode: 'gtag' });
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'page_view',
      expect.objectContaining({
        page_path: '/',
        route_group: 'home',
      }),
    );
    expect(window.dataLayer).toHaveLength(2);

    delete window.gtag;
    delete window.dataLayer;
  });
});
