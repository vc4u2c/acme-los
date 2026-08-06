import type { WebAuthStepUpReason } from '@acme-los/api/contracts';

export type IdxJourneyFlow =
  | 'authenticate'
  | 'register'
  | 'recoverPassword'
  | 'unlockAccount';

export type IdxAuthenticatorOption = {
  value: unknown;
  label: string;
  relatesTo?: {
    key?: string;
  };
};

const rememberPreferenceInputNames = new Set([
  'keepMeSignedIn',
  'rememberDevice',
  'rememberMe',
]);

export function isRememberPreferenceInput(inputName: string): boolean {
  return rememberPreferenceInputNames.has(inputName);
}

const stepUpAuthenticatorKeys: Partial<
  Record<WebAuthStepUpReason, ReadonlySet<string>>
> = {
  funding: new Set(['okta_email', 'phone_number']),
};

const accountStepUpPossessionAuthenticatorKeys: Partial<
  Record<WebAuthStepUpReason, string>
> = {
  'account-email': 'phone_number',
  'account-password': 'phone_number',
  'account-phone': 'okta_email',
  'post-email-change': 'okta_email',
  'post-phone-change': 'phone_number',
  'post-password-change': 'phone_number',
};

export function filterAuthenticatorOptions<T extends IdxAuthenticatorOption>(
  options: T[],
  stepUpReason: WebAuthStepUpReason | null,
  hasVerifiedPassword = false,
): T[] {
  if (!stepUpReason) {
    return options;
  }

  const possessionAuthenticatorKey =
    accountStepUpPossessionAuthenticatorKeys[stepUpReason];
  const allowedKeys = possessionAuthenticatorKey
    ? new Set([
        hasVerifiedPassword ? possessionAuthenticatorKey : 'okta_password',
      ])
    : stepUpAuthenticatorKeys[stepUpReason];
  if (!allowedKeys) {
    return options;
  }

  return options.filter((option) => {
    const key =
      option.relatesTo?.key ??
      (typeof option.value === 'string' ? option.value : undefined);
    return Boolean(key && allowedKeys.has(key));
  });
}

export function getIdxJourneyContent(
  flow: IdxJourneyFlow,
  stepUpReason: WebAuthStepUpReason | null,
): {
  eyebrow: string;
  title: string;
  description: string;
} {
  if (stepUpReason === 'funding') {
    return {
      eyebrow: 'Funding security',
      title: 'Confirm it is you',
      description:
        'Choose email or text message for this funding check. Your password is not required.',
    };
  }

  if (stepUpReason === 'account-email') {
    return {
      eyebrow: 'Account security',
      title: 'Verify before changing email',
      description:
        'Use your password, then confirm with a code sent to your mobile phone.',
    };
  }

  if (stepUpReason === 'account-phone') {
    return {
      eyebrow: 'Account security',
      title: 'Verify before changing phone',
      description:
        'Use your password, then confirm with a code sent to your email.',
    };
  }

  if (stepUpReason === 'account-password') {
    return {
      eyebrow: 'Account security',
      title: 'Verify before changing password',
      description:
        'Use your current password, then confirm with a code sent to your mobile phone.',
    };
  }

  if (stepUpReason === 'post-email-change') {
    return {
      eyebrow: 'Email changed',
      title: 'Sign in with your new email',
      description:
        'Enter your new sign-in email and password, then verify the code sent to that email.',
    };
  }

  if (stepUpReason === 'post-phone-change') {
    return {
      eyebrow: 'Phone changed',
      title: 'Confirm your new phone',
      description:
        'Sign in with your email and password, then verify the code sent to your new mobile phone.',
    };
  }

  if (stepUpReason === 'post-password-change') {
    return {
      eyebrow: 'Password changed',
      title: 'Sign in with your new password',
      description:
        'Use your new password, then verify the code sent to your mobile phone.',
    };
  }

  if (flow === 'register') {
    return {
      eyebrow: 'New application',
      title: 'Create your account',
      description:
        'Set up secure access for your application and future funding updates.',
    };
  }

  if (flow === 'recoverPassword') {
    return {
      eyebrow: 'Account recovery',
      title: 'Reset your password',
      description: 'Verify your account before choosing a new password.',
    };
  }

  if (flow === 'unlockAccount') {
    return {
      eyebrow: 'Account recovery',
      title: 'Unlock your account',
      description: 'Verify your account to restore access.',
    };
  }

  return {
    eyebrow: 'Customer sign in',
    title: 'Continue your application',
    description:
      'Sign in to resume your application, review disclosures, and check funding updates.',
  };
}
