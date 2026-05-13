export type AnalyticsConsentValue = 'denied' | 'granted';

export type AnalyticsMode = 'disabled' | 'gtag' | 'gtm';

export type AnalyticsConsentDefaults = {
  analyticsStorage: AnalyticsConsentValue;
  adStorage: AnalyticsConsentValue;
  adUserData: AnalyticsConsentValue;
  adPersonalization: AnalyticsConsentValue;
};

export type AnalyticsRuntimeConfig = {
  enabled: boolean;
  environment: string;
  mode: AnalyticsMode;
  gtmContainerId: string;
  ga4MeasurementId: string;
  consent: AnalyticsConsentDefaults;
  disabledReason?: string;
};

type EnvironmentSource = Record<string, string | undefined>;

const defaultConsent: AnalyticsConsentDefaults = {
  analyticsStorage: 'denied',
  adStorage: 'denied',
  adUserData: 'denied',
  adPersonalization: 'denied',
};

function readBoolean(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

function readConsentValue(value: string | undefined): AnalyticsConsentValue {
  return value?.trim().toLowerCase() === 'granted' ? 'granted' : 'denied';
}

function readEnvironment(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return 'local';
  }

  return normalized.replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'local';
}

function readGtmContainerId(value: string | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? '';
  return /^GTM-[A-Z0-9]+$/.test(normalized) ? normalized : '';
}

function readGa4MeasurementId(value: string | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? '';
  return /^G-[A-Z0-9]+$/.test(normalized) ? normalized : '';
}

export function getAnalyticsRuntimeConfig(
  source: EnvironmentSource = process.env,
): AnalyticsRuntimeConfig {
  const environment = readEnvironment(
    source.NEXT_PUBLIC_ACME_ANALYTICS_ENVIRONMENT ??
      source.NEXT_PUBLIC_APP_ENVIRONMENT ??
      source.APP_ENVIRONMENT_NAME,
  );
  const enabled = readBoolean(source.NEXT_PUBLIC_ACME_ANALYTICS_ENABLED);
  const gtmContainerId = readGtmContainerId(
    source.NEXT_PUBLIC_ACME_GTM_CONTAINER_ID,
  );
  const ga4MeasurementId = readGa4MeasurementId(
    source.NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID,
  );
  const consent: AnalyticsConsentDefaults = {
    analyticsStorage: readConsentValue(
      source.NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_ANALYTICS_STORAGE ??
        source.ACME_ANALYTICS_CONSENT_DEFAULT_ANALYTICS_STORAGE,
    ),
    adStorage: readConsentValue(
      source.NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_STORAGE ??
        source.ACME_ANALYTICS_CONSENT_DEFAULT_AD_STORAGE,
    ),
    adUserData: readConsentValue(
      source.NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_USER_DATA ??
        source.ACME_ANALYTICS_CONSENT_DEFAULT_AD_USER_DATA,
    ),
    adPersonalization: readConsentValue(
      source.NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_PERSONALIZATION ??
        source.ACME_ANALYTICS_CONSENT_DEFAULT_AD_PERSONALIZATION,
    ),
  };

  if (!enabled) {
    return {
      enabled: false,
      environment,
      mode: 'disabled',
      gtmContainerId,
      ga4MeasurementId,
      consent,
      disabledReason: 'analytics-disabled',
    };
  }

  if (gtmContainerId) {
    return {
      enabled: true,
      environment,
      mode: 'gtm',
      gtmContainerId,
      ga4MeasurementId,
      consent,
    };
  }

  if (ga4MeasurementId) {
    return {
      enabled: true,
      environment,
      mode: 'gtag',
      gtmContainerId,
      ga4MeasurementId,
      consent,
    };
  }

  return {
    enabled: false,
    environment,
    mode: 'disabled',
    gtmContainerId,
    ga4MeasurementId,
    consent: {
      ...defaultConsent,
      ...consent,
    },
    disabledReason: 'missing-google-id',
  };
}

export function isAnalyticsConfigured(
  source: EnvironmentSource = process.env,
): boolean {
  return getAnalyticsRuntimeConfig(source).enabled;
}
