import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDirectory, '..', '..', '..');
const manifestRelativePath = path.join(
  'infra',
  'okta',
  'policy-scenarios.json',
);

function optionalBoolean(value) {
  return value === true;
}

function optionalPositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function interpolateText(value, variables) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replaceAll(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    if (!(key in variables)) {
      throw new Error(`Unknown Okta policy-plan variable "{${key}}".`);
    }

    return `${variables[key]}`;
  });
}

function interpolateValue(value, variables) {
  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, variables));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        interpolateValue(item, variables),
      ]),
    );
  }

  return interpolateText(value, variables);
}

function resolveScope(scopeKind, variables) {
  switch (scopeKind) {
    case 'org':
      return 'Okta org';
    case 'customerGroup':
      return variables.customerGroupName;
    case 'apps':
      return `${variables.webAppLabel}, ${variables.mobileAppLabel}`;
    case 'appsAndCustomerGroup':
      return `${variables.webAppLabel}, ${variables.mobileAppLabel}; customer group ${variables.customerGroupName}`;
    case 'bffAndBackend':
      return 'ACME BFF and backend services';
    case 'orgFeature':
      return 'Okta org feature; scoped only where a customer group or app policy can consume it';
    default:
      return scopeKind;
  }
}

function buildDefaultPolicyNames(environmentName) {
  return {
    authorizationServerPolicyName: `ACME LOS Default Authorization (${environmentName})`,
    authorizationServerRuleName: 'ACME LOS Default Tokens',
    profileEnrollmentPolicyName: `ACME LOS Registration (${environmentName})`,
    mfaEnrollmentPolicyName: `ACME LOS Authenticator Enrollment (${environmentName})`,
    sessionPolicyName: `ACME LOS Global Session (${environmentName})`,
    accessPolicyName: `ACME LOS App Access (${environmentName})`,
  };
}

function buildVariables({
  environmentName,
  customerGroupName,
  webAppLabel,
  mobileAppLabel,
  authorizationServerPolicyName,
  authorizationServerRuleName,
  profileEnrollmentPolicyName,
  mfaEnrollmentPolicyName,
  sessionPolicyName,
  accessPolicyName,
}) {
  const defaultPolicyNames = buildDefaultPolicyNames(environmentName);

  return {
    env: environmentName,
    customerGroupName:
      customerGroupName ?? `acme-los-customers-${environmentName}`,
    webAppLabel: webAppLabel ?? `ACME LOS Web (${environmentName})`,
    mobileAppLabel: mobileAppLabel ?? `ACME LOS Mobile (${environmentName})`,
    authorizationServerPolicyName:
      authorizationServerPolicyName ??
      defaultPolicyNames.authorizationServerPolicyName,
    authorizationServerRuleName:
      authorizationServerRuleName ??
      defaultPolicyNames.authorizationServerRuleName,
    profileEnrollmentPolicyName:
      profileEnrollmentPolicyName ??
      defaultPolicyNames.profileEnrollmentPolicyName,
    mfaEnrollmentPolicyName:
      mfaEnrollmentPolicyName ?? defaultPolicyNames.mfaEnrollmentPolicyName,
    sessionPolicyName:
      sessionPolicyName ?? defaultPolicyNames.sessionPolicyName,
    accessPolicyName: accessPolicyName ?? defaultPolicyNames.accessPolicyName,
  };
}

export function loadOktaPolicyScenarioManifest(repoRoot = defaultRepoRoot) {
  return readJsonFile(path.join(repoRoot, manifestRelativePath));
}

export function resolveOktaPolicyPlan({
  environmentName,
  hostedExperience = {},
  telephonyEnabled = false,
  customerGroupName,
  webAppLabel,
  mobileAppLabel,
  authorizationServerPolicyName,
  authorizationServerRuleName,
  profileEnrollmentPolicyName,
  mfaEnrollmentPolicyName,
  sessionPolicyName,
  accessPolicyName,
  manifest = loadOktaPolicyScenarioManifest(),
}) {
  const variables = buildVariables({
    environmentName,
    customerGroupName,
    webAppLabel,
    mobileAppLabel,
    authorizationServerPolicyName,
    authorizationServerRuleName,
    profileEnrollmentPolicyName,
    mfaEnrollmentPolicyName,
    sessionPolicyName,
    accessPolicyName,
  });
  const runtimeVariables = {
    ...variables,
    sessionLifetimeDays:
      optionalPositiveInteger(
        hostedExperience.customerSessionMaxLifetimeDays,
      ) ?? 60,
    phoneEnrollmentState: telephonyEnabled
      ? 'phone enrollment follows the configured SMS provider rollout state'
      : 'phone enrollment is disabled until a real or dev mock SMS provider is enabled',
    adaptiveMfaState: optionalBoolean(hostedExperience.adaptiveMfaOnSignIn)
      ? 'high-risk adaptive 2FA rule using Okta risk score HIGH plus standard access rule'
      : 'standard access rule',
  };

  const hierarchy = manifest.hierarchy.map((entry) => ({
    ...interpolateValue(entry, runtimeVariables),
    scope: resolveScope(entry.scopeKind, runtimeVariables),
  }));
  const scenarios = manifest.scenarios.map((scenario) => ({
    ...interpolateValue(scenario, runtimeVariables),
    scope: resolveScope(scenario.scopeKind, runtimeVariables),
  }));
  const scenarioById = new Map(
    scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const policyPlan = manifest.policies.map((policy) => ({
    ...interpolateValue(policy, runtimeVariables),
    name: interpolateText(policy.nameTemplate, runtimeVariables),
    scope: resolveScope(policy.scopeKind, runtimeVariables),
    scenarios: (policy.scenarioIds ?? []).map((scenarioId) => {
      const scenario = scenarioById.get(scenarioId);
      if (!scenario) {
        throw new Error(
          `Policy "${policy.id}" references unknown scenario "${scenarioId}".`,
        );
      }

      return {
        id: scenario.id,
        title: scenario.title,
        automationStatus: scenario.automationStatus,
      };
    }),
  }));

  return {
    version: manifest.version,
    environmentName,
    scopeModel: interpolateValue(manifest.scopeModel, runtimeVariables),
    hierarchy,
    policyPlan,
    scenarios,
    manualChecks: manifest.manualChecks.map((check) => ({
      ...interpolateValue(check, runtimeVariables),
      scope: resolveScope(check.scopeKind, runtimeVariables),
    })),
    references: manifest.references,
  };
}

export function buildOktaPolicyPlan(options) {
  return resolveOktaPolicyPlan(options).policyPlan;
}

export function validateOktaPolicyPlan(resolvedPlan) {
  const errors = [];
  const warnings = [];
  const disallowedScopes =
    resolvedPlan.scopeModel.disallowedCustomerScopes ?? [];

  for (const policy of resolvedPlan.policyPlan) {
    for (const disallowedScope of disallowedScopes) {
      if (
        ['customerGroup', 'appsAndCustomerGroup'].includes(policy.scopeKind) &&
        policy.scope.includes(disallowedScope)
      ) {
        errors.push(
          `${policy.id} is scoped to disallowed customer scope ${disallowedScope}.`,
        );
      }
    }

    if (
      ['customerGroup', 'appsAndCustomerGroup'].includes(policy.scopeKind) &&
      !policy.scope.includes(resolvedPlan.scopeModel.customerGroupTemplate)
    ) {
      warnings.push(
        `${policy.id} is customer-scoped; verify it resolves to the environment customer group.`,
      );
    }
  }

  return { errors, warnings };
}

export function printOktaPolicyPlan(policyPlan) {
  console.log('- Okta policy plan:');
  for (const policy of policyPlan) {
    console.log(`  - ${policy.type}: ${policy.name}`);
    console.log(`    Scope: ${policy.scope}`);
    console.log(`    Status: ${policy.automationStatus}`);
    console.log(`    Managed by: ${policy.managedBy}`);
    console.log(`    Configures: ${policy.configures.join('; ')}`);
  }
}

function renderList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

export function renderOktaPolicyPlanMarkdown(resolvedPlan) {
  const lines = [
    `# Okta Policy Plan - ${resolvedPlan.environmentName}`,
    '',
    '## Scope Model',
    '',
    ...resolvedPlan.scopeModel.principles.map((principle) => `- ${principle}`),
    '',
    '## Hierarchy',
    '',
  ];

  for (const item of resolvedPlan.hierarchy) {
    lines.push(
      `### ${item.label}`,
      '',
      `- Scope: ${item.scope}`,
      `- Managed by: ${item.managedBy}`,
      `- Purpose: ${item.purpose}`,
      '',
    );
  }

  lines.push('## Policies', '');
  for (const policy of resolvedPlan.policyPlan) {
    lines.push(
      `### ${policy.name}`,
      '',
      `- Type: ${policy.type}`,
      `- Scope: ${policy.scope}`,
      `- Status: ${policy.automationStatus}`,
      `- Managed by: ${policy.managedBy}`,
      '- Configures:',
      renderList(policy.configures),
      '- Scenarios:',
      renderList(
        policy.scenarios.map(
          (scenario) => `${scenario.title} (${scenario.automationStatus})`,
        ),
      ),
      '',
    );
  }

  lines.push('## Scenarios', '');
  for (const scenario of resolvedPlan.scenarios) {
    lines.push(
      `### ${scenario.title}`,
      '',
      `- Scope: ${scenario.scope}`,
      `- Status: ${scenario.automationStatus}`,
      '- Flow:',
      renderList(scenario.flow),
      '- Security notes:',
      renderList(scenario.securityNotes ?? []),
      '',
    );

    if (scenario.oktaSurfaces?.length > 0) {
      lines.push('- Okta surfaces:', renderList(scenario.oktaSurfaces), '');
    }
  }

  lines.push('## Manual Checks', '');
  for (const check of resolvedPlan.manualChecks) {
    lines.push(`- ${check.title} (${check.scope})`);
  }

  lines.push('', '## References', '');
  for (const reference of resolvedPlan.references) {
    lines.push(`- [${reference.label}](${reference.url})`);
  }

  return `${lines.join('\n')}\n`;
}

function printUsageAndExit() {
  console.error(
    'Usage: node tools/scripts/okta/policy-plan.mjs <dev|qa|stg|prod> [--check]',
  );
  process.exit(1);
}

function isMainModule() {
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
}

if (isMainModule()) {
  const environmentName = process.argv[2];
  const checkOnly = process.argv.includes('--check');

  if (!environmentName) {
    printUsageAndExit();
  }

  const environmentPath = path.join(
    defaultRepoRoot,
    'infra',
    'okta',
    'environments',
    `${environmentName}.json`,
  );
  if (!fs.existsSync(environmentPath)) {
    throw new Error(`Unknown Okta environment "${environmentName}".`);
  }

  const environment = readJsonFile(environmentPath);
  const resolvedPlan = resolveOktaPolicyPlan({
    environmentName,
    hostedExperience: environment.okta?.hostedExperience ?? {},
    telephonyEnabled: environment.okta?.telephony?.enabled === true,
  });
  const validation = validateOktaPolicyPlan(resolvedPlan);

  if (validation.errors.length > 0) {
    for (const error of validation.errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exit(1);
  }

  if (!checkOnly) {
    const outputDirectory = path.join(defaultRepoRoot, 'tmp', 'okta');
    fs.mkdirSync(outputDirectory, { recursive: true });
    const jsonOutputPath = path.join(
      outputDirectory,
      `${environmentName}.policy-plan.json`,
    );
    const markdownOutputPath = path.join(
      outputDirectory,
      `${environmentName}.policy-plan.md`,
    );
    fs.writeFileSync(
      jsonOutputPath,
      `${JSON.stringify(resolvedPlan, null, 2)}\n`,
      'utf8',
    );
    fs.writeFileSync(
      markdownOutputPath,
      renderOktaPolicyPlanMarkdown(resolvedPlan),
      'utf8',
    );

    console.log(`Rendered Okta policy plan for "${environmentName}".`);
    console.log(`- JSON: ${path.relative(defaultRepoRoot, jsonOutputPath)}`);
    console.log(
      `- Markdown: ${path.relative(defaultRepoRoot, markdownOutputPath)}`,
    );
    printOktaPolicyPlan(resolvedPlan.policyPlan);
  }

  for (const warning of validation.warnings) {
    console.warn(`WARN: ${warning}`);
  }
}
