export type AccountSecurityActionId =
  | 'password'
  | 'change-email'
  | 'change-phone';

const accountSecurityActionUrls: Record<AccountSecurityActionId, string> = {
  password: '/account/security/password',
  'change-email': '/account/security/email',
  'change-phone': '/account/security/phone',
};

export function buildAccountSecurityActionUrl(
  actionId: AccountSecurityActionId,
): string {
  return accountSecurityActionUrls[actionId];
}

export function buildAccountSecurityStepUpUrl(
  actionId: AccountSecurityActionId,
): string {
  const searchParams = new URLSearchParams({
    returnTo: buildAccountSecurityActionUrl(actionId),
    aal: 'aal2',
  });

  return `/account/sign-in?${searchParams.toString()}`;
}

export function buildPasswordRecoveryUrl(
  returnTo = '/account/profile?account_action=password',
): string {
  const searchParams = new URLSearchParams({
    returnTo,
    flow: 'recoverPassword',
  });

  return `/account/sign-in?${searchParams.toString()}`;
}
