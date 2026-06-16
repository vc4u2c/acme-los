import { requireServerWebAuthSession } from '@acme-los/api/web-server';
import { AccountSecurityChangePage } from '../../../../components/web/account-security-change-page';
import { getAccountSecurityAuthRequirement } from '../../../../lib/application-auth';

export default async function AccountSecurityPhonePage() {
  await requireServerWebAuthSession({
    returnTo: '/account/security/phone',
    requirement: getAccountSecurityAuthRequirement('phone'),
  });

  return <AccountSecurityChangePage action="phone" />;
}
