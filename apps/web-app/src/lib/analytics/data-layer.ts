import type {
  AnalyticsMode,
  AnalyticsRuntimeConfig,
  AnalyticsConsentDefaults,
} from './config';

export type AnalyticsRenderingMode = 'client' | 'isr' | 'server' | 'static';

export type AnalyticsAuthState =
  | 'anonymous'
  | 'authenticated'
  | 'error'
  | 'loading';

export type AcmeAnalyticsEvent = {
  event: string;
  event_id: string;
  environment: string;
  page_location: string;
  page_title: string;
  page_path: string;
  route_group: string;
  rendering_mode: AnalyticsRenderingMode;
  auth_state: AnalyticsAuthState;
  assurance_level: string;
  journey_name?: string;
  application_step?: string;
  offer_type?: string;
  step_up_reason?: string;
  result?: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function createEventId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function toGoogleConsentDefaults(
  consent: AnalyticsConsentDefaults,
): Record<string, 'denied' | 'granted'> {
  return {
    analytics_storage: consent.analyticsStorage,
    ad_storage: consent.adStorage,
    ad_user_data: consent.adUserData,
    ad_personalization: consent.adPersonalization,
  };
}

export function getAnalyticsRouteGroup(pathname: string): string {
  if (pathname === '/') {
    return 'home';
  }

  if (pathname.startsWith('/apply')) {
    return 'application';
  }

  if (pathname.startsWith('/account')) {
    return 'account';
  }

  if (pathname.startsWith('/auth')) {
    return 'auth';
  }

  if (pathname.startsWith('/legal')) {
    return 'legal';
  }

  if (pathname.startsWith('/rendering-demo')) {
    return 'rendering-demo';
  }

  if (pathname.startsWith('/security')) {
    return 'security';
  }

  if (pathname.startsWith('/showcase')) {
    return 'showcase';
  }

  if (pathname.startsWith('/support')) {
    return 'support';
  }

  return 'content';
}

export function getAnalyticsRenderingMode(
  pathname: string,
): AnalyticsRenderingMode {
  if (pathname === '/rendering-demo/client') {
    return 'client';
  }

  if (pathname === '/rendering-demo/isr') {
    return 'isr';
  }

  if (
    pathname === '/' ||
    pathname === '/rates-terms' ||
    pathname === '/rendering-demo' ||
    pathname === '/rendering-demo/static' ||
    pathname === '/support/contact' ||
    pathname.startsWith('/legal/')
  ) {
    return 'static';
  }

  return 'server';
}

function getApplicationStep(pathname: string): string | undefined {
  const match = /^\/apply\/([^/?#]+)$/.exec(pathname);
  return match?.[1];
}

export function buildPageViewEvent({
  config,
  pathname,
  pageTitle,
  origin,
  authState,
  assuranceLevel,
}: {
  config: AnalyticsRuntimeConfig;
  pathname: string;
  pageTitle: string;
  origin: string;
  authState: AnalyticsAuthState;
  assuranceLevel: string;
}): AcmeAnalyticsEvent {
  const routeGroup = getAnalyticsRouteGroup(pathname);
  const applicationStep = getApplicationStep(pathname);

  return {
    event: 'page_view',
    event_id: createEventId(),
    environment: config.environment,
    page_location: `${origin}${pathname}`,
    page_title: pageTitle,
    page_path: pathname,
    route_group: routeGroup,
    rendering_mode: getAnalyticsRenderingMode(pathname),
    auth_state: authState,
    assurance_level: assuranceLevel,
    ...(routeGroup === 'application'
      ? {
          journey_name: 'loan_application',
        }
      : {}),
    ...(applicationStep
      ? {
          application_step: applicationStep,
        }
      : {}),
  };
}

export function pushAnalyticsEvent(
  event: AcmeAnalyticsEvent,
  options: { mode?: AnalyticsMode } = {},
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(event);

  if (options.mode === 'gtag' && typeof window.gtag === 'function') {
    const { event: eventName, ...parameters } = event;
    window.gtag('event', eventName, parameters);
  }
}
