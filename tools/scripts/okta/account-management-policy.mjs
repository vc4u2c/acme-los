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

function buildAuthenticationMethod(key, method) {
  return {
    key,
    ...(method ? { method } : {}),
  };
}

const emailOtpAuthenticationMethod = buildAuthenticationMethod(
  'okta_email',
  'email',
);
const phoneSmsAuthenticationMethod = buildAuthenticationMethod(
  'phone_number',
  'sms',
);

function buildSecurityQuestionAndPossessionVerificationMethod({
  possessionAuthenticationMethods = [],
} = {}) {
  const possessionConstraint = {
    required: true,
    userPresence: 'OPTIONAL',
    ...(possessionAuthenticationMethods.length > 0
      ? {
          authenticationMethods: possessionAuthenticationMethods,
        }
      : {}),
  };

  return {
    factorMode: '2FA',
    type: 'ASSURANCE',
    reauthenticateIn: 'PT0S',
    constraints: [
      {
        possession: possessionConstraint,
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
  possessionAuthenticationMethods,
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
          buildSecurityQuestionAndPossessionVerificationMethod({
            possessionAuthenticationMethods,
          }),
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
  const phoneSmsPossessionAuthenticationMethods = telephonyEnabled
    ? [phoneSmsAuthenticationMethod]
    : [];
  const passwordPossessionAuthenticationMethods = telephonyEnabled
    ? phoneSmsPossessionAuthenticationMethods
    : [emailOtpAuthenticationMethod];
  const emailLifecyclePossessionAuthenticationMethods = telephonyEnabled
    ? phoneSmsPossessionAuthenticationMethods
    : [emailOtpAuthenticationMethod];
  const phoneLifecyclePossessionAuthenticationMethods = [
    emailOtpAuthenticationMethod,
  ];
  const passwordPossessionFactors = telephonyEnabled
    ? ['phone_number:sms']
    : ['okta_email:email'];
  const emailLifecyclePossessionFactors = telephonyEnabled
    ? ['phone_number:sms']
    : ['okta_email:email'];
  const phoneLifecyclePossessionFactors = ['okta_email:email'];
  const phoneSmsUnavailableNote =
    'Phone/SMS OTP is the target opposite-channel proof, but this environment has telephony disabled, so the rendered payload falls back to email OTP until phone/SMS is enabled.';

  return [
    {
      id: 'password-lifecycle',
      name: `ACME LOS Password Lifecycle (${environmentName})`,
      priority: 1,
      scenarioIds: [
        'forgot-password-security-question-phone-sms-otp',
        'change-password',
      ],
      expectedProofs: [
        'security_question_challenge',
        telephonyEnabled ? 'phone_sms_otp' : 'okta_email_otp',
        'current_password_for_change_password_only',
      ],
      expectedPossessionFactors: passwordPossessionFactors,
      notes: [
        telephonyEnabled
          ? 'Password recovery/change uses phone/SMS OTP as the possession proof plus security question; ACME never receives password or OTP material.'
          : phoneSmsUnavailableNote,
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
          possessionAuthenticationMethods:
            passwordPossessionAuthenticationMethods,
        }),
      scope: customerGroupName,
    },
    {
      id: 'email-lifecycle',
      name: `ACME LOS Email Lifecycle (${environmentName})`,
      priority: 2,
      scenarioIds: ['forgot-email', 'change-email'],
      expectedProofs: ['phone_sms_otp', 'security_question_challenge'],
      expectedPossessionFactors: emailLifecyclePossessionFactors,
      notes: [
        telephonyEnabled
          ? 'Email recovery/change must use phone/SMS OTP as the opposite-channel proof, not the email address being recovered or changed.'
          : phoneSmsUnavailableNote,
        'After email change, Okta signs the customer out; ACME syncs the mutable email claim only after the customer signs in fresh with the new email and satisfies email OTP.',
      ],
      payload: (existingRule) =>
        buildRulePayload({
          existingRule,
          name: `ACME LOS Email Lifecycle (${environmentName})`,
          priority: 2,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'okta_email' && (accessRequest.operation == 'recover' || accessRequest.operation == 'enroll' || accessRequest.operation == 'unenroll')",
          possessionAuthenticationMethods:
            emailLifecyclePossessionAuthenticationMethods,
        }),
      scope: customerGroupName,
    },
    {
      id: 'phone-lifecycle',
      name: `ACME LOS Phone Lifecycle (${environmentName})`,
      priority: 3,
      scenarioIds: ['lost-phone-replace-factor', 'change-phone'],
      expectedProofs: ['okta_email_otp', 'security_question_challenge'],
      expectedPossessionFactors: phoneLifecyclePossessionFactors,
      notes: [
        telephonyEnabled
          ? 'Phone/SMS account-management rule is active because telephony is enabled.'
          : 'Phone/SMS account-management rule is prepared, but the phone authenticator remains inactive until a real or dev mock SMS provider is enabled.',
        'Phone/SMS replacement uses email OTP because the unavailable phone factor cannot prove its own replacement.',
        'After phone/SMS change, Okta signs the customer out; ACME should require fresh sign-in with the unchanged email and the new phone/SMS OTP before syncing verified phone metadata.',
      ],
      payload: (existingRule) =>
        buildRulePayload({
          existingRule,
          name: `ACME LOS Phone Lifecycle (${environmentName})`,
          priority: 3,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'phone_number' && (accessRequest.operation == 'recover' || accessRequest.operation == 'enroll' || accessRequest.operation == 'unenroll')",
          possessionAuthenticationMethods:
            phoneLifecyclePossessionAuthenticationMethods,
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
    console.log(
      `    Possession factors: ${definition.expectedPossessionFactors.join(', ')}`,
    );
  }
}
