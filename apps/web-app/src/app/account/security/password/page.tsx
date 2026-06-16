import { requireServerWebAuthSession } from '@acme-los/api/web-server';
import { AccountSecurityPasswordPage } from '../../../../components/web/account-security-password-page';
import { getAccountSecurityAuthRequirement } from '../../../../lib/application-auth';

export default async function AccountSecurityPasswordRoute() {
  await requireServerWebAuthSession({
    returnTo: '/account/security/password',
    requirement: getAccountSecurityAuthRequirement('password'),
  });

  return <AccountSecurityPasswordPage />;
}
