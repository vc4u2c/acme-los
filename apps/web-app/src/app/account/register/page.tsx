import { getSafeAuthReturnTo } from '@acme-los/auth/core';
import { CustomerIdxAuthPage } from '../../../components/web/customer-idx-auth-page';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo: requestedReturnTo } = await searchParams;
  const returnTo = getSafeAuthReturnTo(
    requestedReturnTo,
    '/apply/personal-info',
  );

  return (
    <CustomerIdxAuthPage
      returnTo={returnTo}
      minimumAssuranceLevel="aal1"
      flow="register"
    />
  );
}
