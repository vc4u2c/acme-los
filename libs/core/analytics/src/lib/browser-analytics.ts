export type AnalyticsConsentValue = 'denied' | 'granted';

export type AnalyticsConsentDefaults = {
  analyticsStorage: AnalyticsConsentValue;
  adStorage: AnalyticsConsentValue;
  adUserData: AnalyticsConsentValue;
  adPersonalization: AnalyticsConsentValue;
};

export type GoogleConsentDefaults = {
  analytics_storage: AnalyticsConsentValue;
  ad_storage: AnalyticsConsentValue;
  ad_user_data: AnalyticsConsentValue;
  ad_personalization: AnalyticsConsentValue;
};

export type AnalyticsDispatchMode = 'disabled' | 'gtag' | 'gtm';

export type AnalyticsDataLayerEvent<TEventName extends string = string> = {
  event: TEventName;
  [parameterName: string]: unknown;
};

export type PushDataLayerEventOptions = {
  dataLayerName?: string;
  mode?: AnalyticsDispatchMode;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function createAnalyticsEventId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeAnalyticsPathname(pathname: string): string {
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

export const getAnalyticsSafePathname = normalizeAnalyticsPathname;

export function toGoogleConsentDefaults(
  consent: AnalyticsConsentDefaults,
): GoogleConsentDefaults {
  return {
    analytics_storage: consent.analyticsStorage,
    ad_storage: consent.adStorage,
    ad_user_data: consent.adUserData,
    ad_personalization: consent.adPersonalization,
  };
}

export function pushDataLayerEvent<TEvent extends AnalyticsDataLayerEvent>(
  event: TEvent,
  options: PushDataLayerEventOptions = {},
): void {
  if (typeof window === 'undefined' || options.mode === 'disabled') {
    return;
  }

  const dataLayerName = options.dataLayerName ?? 'dataLayer';
  const browserWindow = window as unknown as Window & Record<string, unknown>;
  const currentDataLayer = browserWindow[dataLayerName];
  const dataLayer = Array.isArray(currentDataLayer) ? currentDataLayer : [];

  dataLayer.push(event);
  browserWindow[dataLayerName] = dataLayer;

  if (options.mode === 'gtag' && typeof window.gtag === 'function') {
    const { event: eventName, ...parameters } = event;
    window.gtag('event', eventName, parameters);
  }
}
