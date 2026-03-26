import { CustomerProfileDashboard } from '../../../components/web/customer-profile-dashboard';
import { requireServerWebAuthSession } from '@acme-los/api/web-server';

export default async function CustomerProfilePage() {
  await requireServerWebAuthSession({
    returnTo: '/account/profile',
    requirement: {
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal1',
    },
  });

  return <CustomerProfileDashboard />;
}
