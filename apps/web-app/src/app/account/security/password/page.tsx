import { requireServerWebAuthSession } from '@acme-los/api/web-server';
import { AccountSecurityPasswordPage } from '../../../../components/web/account-security-password-page';

export default async function AccountSecurityPasswordRoute() {
  await requireServerWebAuthSession({
    returnTo: '/account/security/password',
    requirement: {
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal1',
    },
  });

  return <AccountSecurityPasswordPage />;
}
