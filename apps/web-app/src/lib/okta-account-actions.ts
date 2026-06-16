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

export function buildHostedPasswordRecoveryUrl(
  returnTo = '/account/profile?account_action=password',
): string {
  const searchParams = new URLSearchParams({
    returnTo,
    widgetFlow: 'resetPassword',
  });

  return `/api/auth/start?${searchParams.toString()}`;
}
