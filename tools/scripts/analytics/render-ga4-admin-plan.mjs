#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');
const environmentName = process.argv[2];

if (!environmentName) {
  console.error(
    'Usage: node tools/scripts/analytics/render-ga4-admin-plan.mjs <dev|qa|stg|prod>',
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
const outputPath = path.join(
  repoRoot,
  'tmp',
  'analytics',
  `${environmentName}.ga4-admin-plan.json`,
);

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

if (!fs.existsSync(environmentPath)) {
  console.error(`Unknown analytics environment "${environmentName}".`);
  process.exit(1);
}

const environment = readJsonFile(environmentPath);
const taxonomy = readJsonFile(eventsPath);
const google = environment.google ?? {};
const clientEvents = taxonomy.events.filter(
  (event) => event.surface === 'client',
);

const plan = {
  environment: environment.environment,
  generatedAt: new Date().toISOString(),
  google: {
    analyticsPropertyName: google.analyticsPropertyName,
    ga4MeasurementId: google.ga4MeasurementId,
    tagManagerContainerName: google.tagManagerContainerName,
    gtmContainerId: google.gtmContainerId,
  },
  ga4Admin: {
    customDimensions: taxonomy.customDimensions,
    keyEvents: taxonomy.keyEvents,
    recommendedEvents: clientEvents
      .filter((event) => event.ga4RecommendedEvent)
      .map((event) => event.name),
  },
  gtmContainer: {
    baselineTags: [
      {
        name: `GA4 - Google tag - ${environment.environment}`,
        type: 'Google tag',
        tagId: google.ga4MeasurementId,
        trigger: 'Initialization - All Pages',
        settings: {
          send_page_view: false,
        },
      },
      {
        name: `GA4 Event - page_view - ${environment.environment}`,
        type: 'Google Analytics: GA4 Event',
        eventName: 'page_view',
        trigger: 'Custom Event - page_view',
      },
    ],
    dataLayerVariables: taxonomy.reservedFields.filter(
      (field) => field !== 'event',
    ),
    customEventTriggers: clientEvents.map((event) => ({
      name: `Custom Event - ${event.name}`,
      eventName: event.name,
      requiredForGa4Dispatch: event.dispatch === 'gtm',
    })),
    directGoogleTagEvents: clientEvents
      .filter((event) => event.dispatch === 'google_tag')
      .map((event) => event.name),
  },
  reports: [
    {
      name: 'Application journey funnel',
      steps: [
        'application_start',
        'application_step_view',
        'application_step_complete',
        'application_submit_succeeded',
      ],
      breakdowns: ['application_step', 'auth_state', 'environment'],
    },
    {
      name: 'Authentication outcome funnel',
      steps: ['sign_in_started', 'login'],
      breakdowns: ['auth_context', 'assurance_level', 'failure_reason_bucket'],
      failureEvent: 'sign_in_failed',
    },
    {
      name: 'Funding assurance funnel',
      steps: [
        'funding_step_up_started',
        'funding_step_up_completed',
        'application_submit_succeeded',
      ],
      breakdowns: ['application_step', 'assurance_level', 'result'],
    },
    {
      name: 'Submit outcome report',
      metrics: ['eventCount', 'keyEvents'],
      events: ['application_submit_succeeded', 'application_submit_failed'],
      breakdowns: ['failure_reason_bucket', 'transport_origin'],
    },
  ],
};

writeJsonFile(outputPath, plan);

console.log(`Rendered GA4 admin plan for "${environmentName}".`);
console.log(`- ${path.relative(repoRoot, outputPath)}`);
