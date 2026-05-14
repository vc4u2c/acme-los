import { getAnalyticsRuntimeConfig } from '../src/lib/analytics/config';
import { buildAnalyticsBootstrapScript } from '../src/components/web/analytics/analytics-scripts';
import {
  bucketAnalyticsFailureReason,
  buildApplicationStepEvent,
  buildApplicationSubmitEvent,
  buildSignInEvent,
  buildPageViewEvent,
  getAnalyticsAuthContext,
  getAnalyticsRenderingMode,
  getAnalyticsRouteGroup,
  getAnalyticsSafePathname,
  getApplicationStepFromPathname,
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

  it('extracts application steps from canonical app routes only', () => {
    expect(getApplicationStepFromPathname('/apply/funding')).toBe('funding');
    expect(getApplicationStepFromPathname('/apply/bank-card')).toBe(
      'bank-card',
    );
    expect(getApplicationStepFromPathname('/apply/funding?token=secret')).toBe(
      'funding',
    );
  });

  it('normalizes analytics paths before events are built', () => {
    expect(
      getAnalyticsSafePathname(
        'https://example.test/apply/funding?token=secret#callback',
      ),
    ).toBe('/apply/funding');
    expect(
      getAnalyticsSafePathname('support/contact?email=a@example.test'),
    ).toBe('/support/contact');
  });

  it('builds page_view events without query strings or PII', () => {
    const config = getAnalyticsRuntimeConfig({
      NEXT_PUBLIC_ACME_ANALYTICS_ENABLED: 'true',
      NEXT_PUBLIC_ACME_GTM_CONTAINER_ID: 'GTM-TEST123',
      NEXT_PUBLIC_ACME_ANALYTICS_ENVIRONMENT: 'qa',
    });

    const event = buildPageViewEvent({
      config,
      pathname: '/apply/personal-info?email=applicant@example.test',
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

  it('builds application milestone events from allowlisted fields', () => {
    const config = getAnalyticsRuntimeConfig({
      NEXT_PUBLIC_ACME_ANALYTICS_ENABLED: 'true',
      NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID: 'G-ABC123',
      NEXT_PUBLIC_ACME_ANALYTICS_ENVIRONMENT: 'dev',
    });

    const stepEvent = buildApplicationStepEvent({
      config,
      pathname: '/apply/bank-card',
      pageTitle: 'Bank',
      origin: 'https://example.test',
      authState: 'authenticated',
      assuranceLevel: 'aal1',
      eventName: 'application_step_complete',
      step: 'bank-card',
      stepDestination: 'pre-approval',
      result: 'success',
    });
    const submitEvent = buildApplicationSubmitEvent({
      config,
      pathname: '/apply/funding',
      pageTitle: 'Funding',
      origin: 'https://example.test',
      authState: 'authenticated',
      assuranceLevel: 'aal2',
      eventName: 'generate_lead',
      step: 'funding',
    });

    expect(stepEvent).toMatchObject({
      event: 'application_step_complete',
      journey_name: 'loan_application',
      application_step: 'bank-card',
      step_destination: 'pre-approval',
      result: 'success',
    });
    expect(submitEvent).toMatchObject({
      event: 'generate_lead',
      milestone_name: 'ga4_recommended_lead_generated',
      transport_origin: 'browser_after_server_success',
    });
    expect(JSON.stringify({ stepEvent, submitEvent })).not.toContain('4111');
  });

  it('uses auth contexts and failure buckets without raw auth errors', () => {
    const config = getAnalyticsRuntimeConfig({
      NEXT_PUBLIC_ACME_ANALYTICS_ENABLED: 'true',
      NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID: 'G-ABC123',
    });
    const failureReasonBucket = bucketAnalyticsFailureReason(
      'The Okta callback state did not match this sign-in attempt.',
    );

    const event = buildSignInEvent({
      config,
      pathname: '/account/sign-in',
      pageTitle: 'Sign in',
      origin: 'https://example.test',
      authState: 'anonymous',
      assuranceLevel: 'anonymous',
      eventName: 'sign_in_failed',
      authContext: getAnalyticsAuthContext('/apply/funding', 'aal2'),
      failureReasonBucket,
    });

    expect(event).toMatchObject({
      event: 'sign_in_failed',
      auth_context: 'funding_step_up',
      failure_reason_bucket: 'state_mismatch',
      method: 'okta',
      result: 'failure',
    });
    expect(JSON.stringify(event)).not.toContain('Okta callback');
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
