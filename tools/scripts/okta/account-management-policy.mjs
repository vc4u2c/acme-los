export const accountManagementPolicyResourceType =
  'END_USER_ACCOUNT_MANAGEMENT';

function buildCustomerGroupCondition(customerGroupId) {
  return {
    users: {
      exclude: [],
      include: [],
    },
    groups: {
      exclude: [],
      include: [customerGroupId],
    },
  };
}

function buildSecurityQuestionAndPossessionVerificationMethod() {
  return {
    factorMode: '2FA',
    type: 'ASSURANCE',
    reauthenticateIn: 'PT0S',
    constraints: [
      {
        possession: {
          required: true,
          userPresence: 'OPTIONAL',
        },
      },
      {
        knowledge: {
          required: true,
          types: ['security_question'],
        },
      },
    ],
  };
}

function buildRulePayload({
  existingRule,
  name,
  priority,
  customerGroupId,
  elCondition,
}) {
  return {
    ...(existingRule?.id ? { id: existingRule.id } : {}),
    type: 'ACCESS_POLICY',
    name,
    priority,
    status: 'ACTIVE',
    system: false,
    conditions: {
      people: buildCustomerGroupCondition(customerGroupId),
      network: {
        connection: 'ANYWHERE',
      },
      riskScore: {
        level: 'ANY',
      },
      elCondition: {
        condition: elCondition,
      },
      platform: {
        include: [],
      },
    },
    actions: {
      appSignOn: {
        access: 'ALLOW',
        verificationMethod:
          buildSecurityQuestionAndPossessionVerificationMethod(),
      },
    },
  };
}

export function isAccountManagementPolicy(policy) {
  return (
    policy?.type === 'ACCESS_POLICY' &&
    policy?._embedded?.resourceType === accountManagementPolicyResourceType
  );
}

export function findAccountManagementPolicy(policies) {
  return policies.find((policy) => isAccountManagementPolicy(policy)) ?? null;
}

export function buildAccountManagementPolicyRuleDefinitions({
  environmentName,
  customerGroupId,
  customerGroupName,
  telephonyEnabled,
}) {
  const expectedPossessionFactors = telephonyEnabled
    ? ['okta_email', 'phone_number']
    : ['okta_email'];

  return [
    {
      id: 'password-lifecycle',
      name: `ACME LOS Password Lifecycle (${environmentName})`,
      priority: 1,
      scenarioIds: [
        'forgot-password-security-question-email-otp',
        'change-password',
      ],
      expectedProofs: [
        'security_question_challenge',
        'possession_factor_otp',
        'current_password_for_change_password_only',
      ],
      expectedPossessionFactors,
      notes: [
        'Forgot-password recovery should use the Okta password policy recovery method for email OTP, then this account-management rule requires fresh proof.',
        'Change-password remains Okta-hosted; ACME never receives password material.',
      ],
      payload: (existingRule) =>
        buildRulePayload({
          existingRule,
          name: `ACME LOS Password Lifecycle (${environmentName})`,
          priority: 1,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'okta_password' && (accessRequest.operation == 'recover' || accessRequest.operation == 'enroll' || accessRequest.operation == 'unenroll')",
        }),
      scope: customerGroupName,
    },
    {
      id: 'email-lifecycle',
      name: `ACME LOS Email Lifecycle (${environmentName})`,
      priority: 2,
      scenarioIds: ['forgot-email', 'change-email'],
      expectedProofs: [
        'other_possession_factor_otp',
        'security_question_challenge',
      ],
      expectedPossessionFactors,
      notes: [
        'Okta owns email authenticator changes; ACME syncs the mutable email claim only after a fresh sign-in.',
        'Forgot-email remains limited by the possession factors enabled in the Okta org.',
      ],
      payload: (existingRule) =>
        buildRulePayload({
          existingRule,
          name: `ACME LOS Email Lifecycle (${environmentName})`,
          priority: 2,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'okta_email' && (accessRequest.operation == 'recover' || accessRequest.operation == 'enroll' || accessRequest.operation == 'unenroll')",
        }),
      scope: customerGroupName,
    },
    {
      id: 'phone-lifecycle',
      name: `ACME LOS Phone Lifecycle (${environmentName})`,
      priority: 3,
      scenarioIds: ['forgot-phone', 'change-phone'],
      expectedProofs: ['okta_email_otp', 'security_question_challenge'],
      expectedPossessionFactors: ['okta_email'],
      notes: [
        telephonyEnabled
          ? 'Phone/SMS account-management rule is active because telephony is enabled.'
          : 'Phone/SMS account-management rule is prepared, but the phone authenticator remains inactive until ACS SMS is approved.',
        'ACME syncs verified phone metadata only from a trusted Okta claim, Management API lookup, or event hook after fresh sign-in.',
      ],
      payload: (existingRule) =>
        buildRulePayload({
          existingRule,
          name: `ACME LOS Phone Lifecycle (${environmentName})`,
          priority: 3,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'phone_number' && (accessRequest.operation == 'recover' || accessRequest.operation == 'enroll' || accessRequest.operation == 'unenroll')",
        }),
      scope: customerGroupName,
    },
  ];
}

export function summarizeAccountManagementPolicyRules(ruleDefinitions) {
  return ruleDefinitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    priority: definition.priority,
    scope: definition.scope,
    scenarioIds: definition.scenarioIds,
    expectedProofs: definition.expectedProofs,
    expectedPossessionFactors: definition.expectedPossessionFactors,
    notes: definition.notes,
    payload: definition.payload(),
  }));
}

export function printAccountManagementPolicyRules(ruleDefinitions) {
  console.log('- Okta account-management policy rules:');
  for (const definition of ruleDefinitions) {
    console.log(`  - ${definition.name}`);
    console.log(`    Scope: ${definition.scope}`);
    console.log(`    Priority: ${definition.priority}`);
    console.log(`    Scenarios: ${definition.scenarioIds.join(', ')}`);
    console.log(`    Proofs: ${definition.expectedProofs.join(', ')}`);
  }
}
