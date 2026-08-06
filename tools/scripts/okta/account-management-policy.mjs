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

export function buildRetiredAccountManagementPolicyRuleNames(environmentName) {
  return [
    `ACME LOS Password Change (${environmentName})`,
    `ACME LOS Email Recovery (${environmentName})`,
    `ACME LOS Email Change (${environmentName})`,
    `ACME LOS Phone Change (${environmentName})`,
  ];
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
  const phoneLifecyclePossessionAuthenticationMethods = [
    emailOtpAuthenticationMethod,
  ];
  const passwordPossessionFactors = telephonyEnabled
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
      id: 'phone-recovery',
      name: `ACME LOS Phone Recovery (${environmentName})`,
      priority: 2,
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
          priority: 2,
          customerGroupId,
          elCondition:
            "accessRequest.authenticator.key == 'phone_number' && accessRequest.operation == 'recover'",
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
