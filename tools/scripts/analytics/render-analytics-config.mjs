#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');
const environmentName = process.argv[2];

if (!environmentName) {
  console.error(
    'Usage: node tools/scripts/analytics/render-analytics-config.mjs <dev|qa|stg|prod>',
  );
  process.exit(1);
}

const environmentPath = path.join(
  repoRoot,
  'infra',
  'analytics',
  'environments',
  `${environmentName}.json`,
);
const eventsPath = path.join(repoRoot, 'infra', 'analytics', 'events.json');
const outputDirectory = path.join(repoRoot, 'tmp', 'analytics');

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeTextFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${value.trimEnd()}\n`, 'utf8');
}

function asEnvBoolean(value) {
  return value ? 'true' : 'false';
}

function requiredString(value, name) {
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string.`);
  }

  return value.trim();
}

if (!fs.existsSync(environmentPath)) {
  console.error(`Unknown analytics environment "${environmentName}".`);
  process.exit(1);
}

const environment = readJsonFile(environmentPath);
const events = readJsonFile(eventsPath);
const google = environment.google ?? {};
const web = environment.web ?? {};
const consent = environment.consent ?? {};

const rendered = {
  environment: requiredString(environment.environment, 'environment'),
  enabled: Boolean(environment.enabled),
  web: {
    baseUrl: requiredString(web.baseUrl ?? '', 'web.baseUrl'),
    deployedBaseUrl: requiredString(
      web.deployedBaseUrl ?? '',
      'web.deployedBaseUrl',
    ),
  },
  google: {
    accountName: requiredString(google.accountName ?? '', 'google.accountName'),
    analyticsPropertyName: requiredString(
      google.analyticsPropertyName ?? '',
      'google.analyticsPropertyName',
    ),
    tagManagerAccountName: requiredString(
      google.tagManagerAccountName ?? '',
      'google.tagManagerAccountName',
    ),
    tagManagerContainerName: requiredString(
      google.tagManagerContainerName ?? '',
      'google.tagManagerContainerName',
    ),
    ga4MeasurementId: requiredString(
      google.ga4MeasurementId ?? '',
      'google.ga4MeasurementId',
    ),
    gtmContainerId: requiredString(
      google.gtmContainerId ?? '',
      'google.gtmContainerId',
    ),
    gtmEnvironmentName: requiredString(
      google.gtmEnvironmentName ?? '',
      'google.gtmEnvironmentName',
    ),
    measurementProtocolSecretName: requiredString(
      google.measurementProtocolSecretName ?? '',
      'google.measurementProtocolSecretName',
    ),
  },
  consent: {
    defaultAnalyticsStorage: requiredString(
      consent.defaultAnalyticsStorage ?? 'denied',
      'consent.defaultAnalyticsStorage',
    ),
    defaultAdStorage: requiredString(
      consent.defaultAdStorage ?? 'denied',
      'consent.defaultAdStorage',
    ),
    defaultAdUserData: requiredString(
      consent.defaultAdUserData ?? 'denied',
      'consent.defaultAdUserData',
    ),
    defaultAdPersonalization: requiredString(
      consent.defaultAdPersonalization ?? 'denied',
      'consent.defaultAdPersonalization',
    ),
  },
  events,
};

const analyticsOutputPath = path.join(
  outputDirectory,
  `${environmentName}.analytics.json`,
);
const envOutputPath = path.join(outputDirectory, `${environmentName}.web.env`);

writeJsonFile(analyticsOutputPath, rendered);
writeTextFile(
  envOutputPath,
  `
# Generated from infra/analytics/environments/${environmentName}.json.
# Do not commit generated tmp/analytics files.
NEXT_PUBLIC_ACME_ANALYTICS_ENABLED=${asEnvBoolean(rendered.enabled)}
NEXT_PUBLIC_ACME_ANALYTICS_ENVIRONMENT=${rendered.environment}
NEXT_PUBLIC_ACME_GTM_CONTAINER_ID=${rendered.google.gtmContainerId}
NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID=${rendered.google.ga4MeasurementId}
NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_ANALYTICS_STORAGE=${rendered.consent.defaultAnalyticsStorage}
NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_STORAGE=${rendered.consent.defaultAdStorage}
NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_USER_DATA=${rendered.consent.defaultAdUserData}
NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_PERSONALIZATION=${rendered.consent.defaultAdPersonalization}
ACME_GA4_MEASUREMENT_ID=${rendered.google.ga4MeasurementId}
ACME_GA4_MEASUREMENT_PROTOCOL_SECRET_NAME=${rendered.google.measurementProtocolSecretName}
ACME_ANALYTICS_CONSENT_DEFAULT_ANALYTICS_STORAGE=${rendered.consent.defaultAnalyticsStorage}
ACME_ANALYTICS_CONSENT_DEFAULT_AD_STORAGE=${rendered.consent.defaultAdStorage}
ACME_ANALYTICS_CONSENT_DEFAULT_AD_USER_DATA=${rendered.consent.defaultAdUserData}
ACME_ANALYTICS_CONSENT_DEFAULT_AD_PERSONALIZATION=${rendered.consent.defaultAdPersonalization}
`,
);

console.log(`Rendered analytics config for "${environmentName}".`);
console.log(`- ${path.relative(repoRoot, analyticsOutputPath)}`);
console.log(`- ${path.relative(repoRoot, envOutputPath)}`);

if (rendered.enabled && !rendered.google.gtmContainerId) {
  console.warn(
    'Analytics is enabled, but google.gtmContainerId is empty. Complete the Google Tag Manager manual setup before runtime use.',
  );
}

if (rendered.enabled && !rendered.google.ga4MeasurementId) {
  console.warn(
    'Analytics is enabled, but google.ga4MeasurementId is empty. Complete the GA4 web stream setup before runtime use.',
  );
}
