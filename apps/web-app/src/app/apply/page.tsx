import { requireServerWebAuthSession } from '@acme-los/api/web-server';
import { redirect } from 'next/navigation';

export default async function ApplyIndexPage() {
  await requireServerWebAuthSession({
    returnTo: '/apply/personal-info',
    requirement: {
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal1',
    },
  });

  redirect('/apply/personal-info');
}
