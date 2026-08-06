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

function buildPossessionOnlyVerificationMethod({
  possessionAuthenticationMethods = [],
} = {}) {
  return {
    factorMode: '1FA',
    type: 'ASSURANCE',
    reauthenticateIn: 'PT0S',
    constraints: [
      {
        possession: {
          required: true,
          userPresence: 'OPTIONAL',
          ...(possessionAuthenticationMethods.length > 0
            ? {
                authenticationMethods: possessionAuthenticationMethods,
              }
            : {}),
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
  verificationMethodBuilder = buildSecurityQuestionAndPossessionVerificationMethod,
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
        verificationMethod: verificationMethodBuilder({
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
      id: 'password-recovery',
      name: `ACME LOS Password Recovery (${environmentName})`,
      priority: 1,
      scenarioIds: ['forgot-password-security-question-phone-sms-otp'],
      expectedProofs: [
        'security_question_challenge',
        telephonyEnabled ? 'phone_sms_otp' : 'okta_email_otp',
      ],
      expectedPossessionFactors: passwordPossessionFactors,
      notes: [
        telephonyEnabled
          ? 'Password recovery uses phone/SMS OTP as the possession proof plus security question; ACME never receives password or OTP material.'
          : phoneSmsUnavailableNote,
      ],
      payload: (existingRule) =>
        buildRulePayload({
          existingRule,
          name: `ACME LOS Password Recovery (${environmentName})`,
          priority: 1,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'okta_password' && accessRequest.operation == 'recover'",
          possessionAuthenticationMethods:
            passwordPossessionAuthenticationMethods,
        }),
      scope: customerGroupName,
    },
    {
      id: 'password-change',
      name: `ACME LOS Password Change (${environmentName})`,
      priority: 2,
      scenarioIds: ['change-password'],
      expectedProofs: [
        'current_password',
        telephonyEnabled ? 'phone_sms_otp' : 'okta_email_otp',
        'security_question_challenge',
      ],
      expectedPossessionFactors: passwordPossessionFactors,
      notes: [
        telephonyEnabled
          ? 'Password change uses current password, phone/SMS OTP, and security-question hint/challenge.'
          : phoneSmsUnavailableNote,
        'Change-password remains protected by Okta MyAccount; ACME never stores password or OTP material.',
      ],
      payload: (existingRule) =>
        buildRulePayload({
          existingRule,
          name: `ACME LOS Password Change (${environmentName})`,
          priority: 2,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'okta_password' && (accessRequest.operation == 'enroll' || accessRequest.operation == 'unenroll')",
          possessionAuthenticationMethods:
            passwordPossessionAuthenticationMethods,
        }),
      scope: customerGroupName,
    },
    {
      id: 'email-recovery',
      name: `ACME LOS Email Recovery (${environmentName})`,
      priority: 3,
      scenarioIds: ['forgot-email'],
      expectedProofs: ['phone_sms_otp', 'security_question_challenge'],
      expectedPossessionFactors: emailLifecyclePossessionFactors,
      notes: [
        telephonyEnabled
          ? 'Email recovery must use phone/SMS OTP as the opposite-channel proof plus security question, not the email address being recovered.'
          : phoneSmsUnavailableNote,
      ],
      payload: (existingRule) =>
        buildRulePayload({
          existingRule,
          name: `ACME LOS Email Recovery (${environmentName})`,
          priority: 3,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'okta_email' && accessRequest.operation == 'recover'",
          possessionAuthenticationMethods:
            emailLifecyclePossessionAuthenticationMethods,
        }),
      scope: customerGroupName,
    },
    {
      id: 'email-change',
      name: `ACME LOS Email Change (${environmentName})`,
      priority: 4,
      scenarioIds: ['change-email'],
      expectedProofs: ['current_password', 'phone_sms_otp'],
      expectedPossessionFactors: emailLifecyclePossessionFactors,
      notes: [
        telephonyEnabled
          ? 'Email change uses current password plus phone/SMS OTP as the opposite-channel proof; security question is reserved for recovery.'
          : phoneSmsUnavailableNote,
        'After email change, Okta signs the customer out; ACME syncs the mutable email claim only after the customer signs in fresh with the new email and satisfies email OTP.',
      ],
      payload: (existingRule) =>
        buildRulePayload({
          existingRule,
          name: `ACME LOS Email Change (${environmentName})`,
          priority: 4,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'okta_email' && (accessRequest.operation == 'enroll' || accessRequest.operation == 'unenroll')",
          possessionAuthenticationMethods:
            emailLifecyclePossessionAuthenticationMethods,
          verificationMethodBuilder: buildPossessionOnlyVerificationMethod,
        }),
      scope: customerGroupName,
    },
    {
      id: 'phone-recovery',
      name: `ACME LOS Phone Recovery (${environmentName})`,
      priority: 5,
      scenarioIds: ['lost-phone-replace-factor'],
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
          name: `ACME LOS Phone Recovery (${environmentName})`,
          priority: 5,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'phone_number' && accessRequest.operation == 'recover'",
          possessionAuthenticationMethods:
            phoneLifecyclePossessionAuthenticationMethods,
        }),
      scope: customerGroupName,
    },
    {
      id: 'phone-change',
      name: `ACME LOS Phone Change (${environmentName})`,
      priority: 6,
      scenarioIds: ['change-phone'],
      expectedProofs: ['current_password', 'okta_email_otp'],
      expectedPossessionFactors: phoneLifecyclePossessionFactors,
      notes: [
        'Phone/SMS change uses current password plus email OTP as the opposite-channel proof; security question is reserved for recovery.',
        'After phone/SMS change, Okta signs the customer out; ACME should require fresh sign-in with the unchanged email and the new phone/SMS OTP before syncing verified phone metadata.',
      ],
      payload: (existingRule) =>
        buildRulePayload({
          existingRule,
          name: `ACME LOS Phone Change (${environmentName})`,
          priority: 6,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'phone_number' && (accessRequest.operation == 'enroll' || accessRequest.operation == 'unenroll')",
          possessionAuthenticationMethods:
            phoneLifecyclePossessionAuthenticationMethods,
          verificationMethodBuilder: buildPossessionOnlyVerificationMethod,
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
