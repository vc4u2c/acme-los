import { requireServerWebAuthSession } from '@acme-los/api/web-server';
import { AccountSecurityChangePage } from '../../../../components/web/account-security-change-page';
import { getAccountSecurityAuthRequirement } from '../../../../lib/application-auth';

export default async function AccountSecurityEmailPage() {
  const session = await requireServerWebAuthSession({
    returnTo: '/account/security/email',
    requirement: getAccountSecurityAuthRequirement('email'),
  });

  return (
    <AccountSecurityChangePage
      action="email"
      currentValue={session.user?.email}
    />
  );
}
