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

export type AnalyticsApplicationStep =
  | 'personal-info'
  | 'disclosures'
  | 'employment-income'
  | 'bank-card'
  | 'pre-approval'
  | 'documents-signing'
  | 'funding';

export type AnalyticsAuthContext =
  | 'account'
  | 'application'
  | 'funding_step_up'
  | 'standard';

export type AnalyticsEventResult =
  | 'failure'
  | 'started'
  | 'success'
  | 'validation_error';

export type AnalyticsFailureReasonBucket =
  | 'expired'
  | 'network_or_runtime'
  | 'provider_error'
  | 'rate_limited'
  | 'state_mismatch'
  | 'unknown'
  | 'validation';

export type AcmeAnalyticsEventName =
  | 'application_start'
  | 'application_step_complete'
  | 'application_step_view'
  | 'application_submit_clicked'
  | 'application_submit_failed'
  | 'application_submit_succeeded'
  | 'funding_step_up_completed'
  | 'funding_step_up_started'
  | 'generate_lead'
  | 'login'
  | 'page_view'
  | 'preapproval_offer_selected'
  | 'sign_in_failed'
  | 'sign_in_started';

export type AcmeAnalyticsEvent = {
  event: AcmeAnalyticsEventName;
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
  application_step?: AnalyticsApplicationStep;
  auth_context?: AnalyticsAuthContext;
  failure_reason_bucket?: AnalyticsFailureReasonBucket;
  method?: string;
  milestone_name?: string;
  offer_type?: string;
  step_destination?: AnalyticsApplicationStep;
  step_up_reason?: string;
  result?: AnalyticsEventResult;
  transport_origin?: 'browser' | 'browser_after_server_success';
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

export function getAnalyticsSafePathname(pathname: string): string {
  const rawPathname = pathname.trim();

  if (!rawPathname) {
    return '/';
  }

  if (/^https?:\/\//i.test(rawPathname)) {
    try {
      return new URL(rawPathname).pathname || '/';
    } catch {
      return '/';
    }
  }

  const [pathOnly] = rawPathname.split(/[?#]/);
  const normalizedPath = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;

  return normalizedPath || '/';
}

export function toAnalyticsAuthState(
  status: string,
  isAuthenticated: boolean,
): AnalyticsAuthState {
  if (status === 'loading') {
    return 'loading';
  }

  if (status === 'error') {
    return 'error';
  }

  return isAuthenticated ? 'authenticated' : 'anonymous';
}

export function getApplicationStepFromPathname(
  pathname: string,
): AnalyticsApplicationStep | undefined {
  const match = /^\/apply\/([^/?#]+)$/.exec(getAnalyticsSafePathname(pathname));
  const step = match?.[1];

  if (
    step === 'personal-info' ||
    step === 'disclosures' ||
    step === 'employment-income' ||
    step === 'bank-card' ||
    step === 'pre-approval' ||
    step === 'documents-signing' ||
    step === 'funding'
  ) {
    return step;
  }

  return undefined;
}

export function getAnalyticsAuthContext(
  returnTo: string | undefined,
  assuranceLevel: string | undefined,
): AnalyticsAuthContext {
  const pathname = returnTo ? getAnalyticsSafePathname(returnTo) : '';

  if (assuranceLevel === 'aal2' || pathname === '/apply/funding') {
    return 'funding_step_up';
  }

  if (pathname.startsWith('/apply')) {
    return 'application';
  }

  if (pathname.startsWith('/account')) {
    return 'account';
  }

  return 'standard';
}

export function bucketAnalyticsFailureReason(
  value: unknown,
): AnalyticsFailureReasonBucket {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === 'string'
        ? value
        : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('too many') || normalized.includes('rate limit')) {
    return 'rate_limited';
  }

  if (normalized.includes('expired') || normalized.includes('start sign-in')) {
    return 'expired';
  }

  if (normalized.includes('state') || normalized.includes('nonce')) {
    return 'state_mismatch';
  }

  if (
    normalized.includes('okta') ||
    normalized.includes('provider') ||
    normalized.includes('authorization')
  ) {
    return 'provider_error';
  }

  if (
    normalized.includes('csrf') ||
    normalized.includes('invalid') ||
    normalized.includes('expected') ||
    normalized.includes('validation')
  ) {
    return 'validation';
  }

  if (
    normalized.includes('fetch') ||
    normalized.includes('network') ||
    normalized.includes('runtime') ||
    normalized.includes('unable')
  ) {
    return 'network_or_runtime';
  }

  return 'unknown';
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
  const safePathname = getAnalyticsSafePathname(pathname);
  const routeGroup = getAnalyticsRouteGroup(safePathname);
  const applicationStep = getApplicationStepFromPathname(safePathname);

  return {
    event: 'page_view',
    event_id: createEventId(),
    environment: config.environment,
    page_location: `${origin}${safePathname}`,
    page_title: pageTitle,
    page_path: safePathname,
    route_group: routeGroup,
    rendering_mode: getAnalyticsRenderingMode(safePathname),
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

type BaseEventInput = {
  config: AnalyticsRuntimeConfig;
  pathname: string;
  pageTitle: string;
  origin: string;
  authState: AnalyticsAuthState;
  assuranceLevel: string;
};

function buildBaseEvent({
  config,
  pathname,
  pageTitle,
  origin,
  authState,
  assuranceLevel,
  eventName,
}: BaseEventInput & { eventName: AcmeAnalyticsEventName }): AcmeAnalyticsEvent {
  const safePathname = getAnalyticsSafePathname(pathname);
  const routeGroup = getAnalyticsRouteGroup(safePathname);

  return {
    event: eventName,
    event_id: createEventId(),
    environment: config.environment,
    page_location: `${origin}${safePathname}`,
    page_title: pageTitle,
    page_path: safePathname,
    route_group: routeGroup,
    rendering_mode: getAnalyticsRenderingMode(safePathname),
    auth_state: authState,
    assurance_level: assuranceLevel,
  };
}

export function buildApplicationStartEvent({
  config,
  pathname,
  pageTitle,
  origin,
  authState,
  assuranceLevel,
}: BaseEventInput): AcmeAnalyticsEvent {
  return {
    ...buildBaseEvent({
      config,
      pathname,
      pageTitle,
      origin,
      authState,
      assuranceLevel,
      eventName: 'application_start',
    }),
    journey_name: 'loan_application',
    milestone_name: 'application_started',
    result: 'started',
    transport_origin: 'browser',
  };
}

export function buildApplicationStepEvent({
  config,
  pathname,
  pageTitle,
  origin,
  authState,
  assuranceLevel,
  eventName,
  step,
  result,
  stepDestination,
}: BaseEventInput & {
  eventName: 'application_step_complete' | 'application_step_view';
  step: AnalyticsApplicationStep;
  result?: AnalyticsEventResult;
  stepDestination?: AnalyticsApplicationStep;
}): AcmeAnalyticsEvent {
  return {
    ...buildBaseEvent({
      config,
      pathname,
      pageTitle,
      origin,
      authState,
      assuranceLevel,
      eventName,
    }),
    journey_name: 'loan_application',
    application_step: step,
    ...(stepDestination ? { step_destination: stepDestination } : {}),
    ...(result ? { result } : {}),
    milestone_name:
      eventName === 'application_step_view'
        ? 'application_step_viewed'
        : 'application_step_completed',
    transport_origin: 'browser',
  };
}

export function buildApplicationSubmitEvent({
  config,
  pathname,
  pageTitle,
  origin,
  authState,
  assuranceLevel,
  eventName,
  step,
  failureReasonBucket,
}: BaseEventInput & {
  eventName:
    | 'application_submit_clicked'
    | 'application_submit_failed'
    | 'application_submit_succeeded'
    | 'generate_lead';
  step: AnalyticsApplicationStep;
  failureReasonBucket?: AnalyticsFailureReasonBucket;
}): AcmeAnalyticsEvent {
  const isFailure = eventName === 'application_submit_failed';
  const isStarted = eventName === 'application_submit_clicked';

  return {
    ...buildBaseEvent({
      config,
      pathname,
      pageTitle,
      origin,
      authState,
      assuranceLevel,
      eventName,
    }),
    journey_name: 'loan_application',
    application_step: step,
    milestone_name:
      eventName === 'generate_lead'
        ? 'ga4_recommended_lead_generated'
        : 'application_submitted',
    result: isFailure ? 'failure' : isStarted ? 'started' : 'success',
    ...(failureReasonBucket
      ? { failure_reason_bucket: failureReasonBucket }
      : {}),
    transport_origin:
      eventName === 'application_submit_succeeded' ||
      eventName === 'generate_lead'
        ? 'browser_after_server_success'
        : 'browser',
  };
}

export function buildFundingStepUpEvent({
  config,
  pathname,
  pageTitle,
  origin,
  authState,
  assuranceLevel,
  eventName,
  result,
}: BaseEventInput & {
  eventName: 'funding_step_up_completed' | 'funding_step_up_started';
  result: 'started' | 'success';
}): AcmeAnalyticsEvent {
  return {
    ...buildBaseEvent({
      config,
      pathname,
      pageTitle,
      origin,
      authState,
      assuranceLevel,
      eventName,
    }),
    journey_name: 'loan_application',
    application_step: 'funding',
    auth_context: 'funding_step_up',
    milestone_name: 'funding_step_up',
    step_up_reason: 'funding',
    result,
    transport_origin: 'browser',
  };
}

export function buildSignInEvent({
  config,
  pathname,
  pageTitle,
  origin,
  authState,
  assuranceLevel,
  eventName,
  authContext,
  failureReasonBucket,
}: BaseEventInput & {
  eventName: 'login' | 'sign_in_failed' | 'sign_in_started';
  authContext: AnalyticsAuthContext;
  failureReasonBucket?: AnalyticsFailureReasonBucket;
}): AcmeAnalyticsEvent {
  const isFailure = eventName === 'sign_in_failed';
  const isStarted = eventName === 'sign_in_started';

  return {
    ...buildBaseEvent({
      config,
      pathname,
      pageTitle,
      origin,
      authState,
      assuranceLevel,
      eventName,
    }),
    journey_name: 'authentication',
    auth_context: authContext,
    method: 'okta',
    milestone_name:
      eventName === 'login' ? 'sign_in_completed' : 'sign_in_attempt',
    result: isFailure ? 'failure' : isStarted ? 'started' : 'success',
    ...(failureReasonBucket
      ? { failure_reason_bucket: failureReasonBucket }
      : {}),
    transport_origin: 'browser',
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
