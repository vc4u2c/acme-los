import { requireServerWebAuthSession } from '@acme-los/api/web-server';
import { notFound } from 'next/navigation';
import { SecurityInspectorDashboard } from '../../components/web/security-inspector-dashboard';
import { isSecurityInspectorEnabled } from '../../lib/security-demo';

export default async function SecurityPage() {
  if (!isSecurityInspectorEnabled()) {
    notFound();
  }

  await requireServerWebAuthSession({
    returnTo: '/security',
    requirement: {
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal1',
    },
  });

  return <SecurityInspectorDashboard />;
}
