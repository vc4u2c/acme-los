import { ApplicationEntryPage } from '../../components/web/apply/application-entry-page';
import { requireServerWebAuthSession } from '../../server/web-api/server-session';

export default async function ApplyIndexPage() {
  await requireServerWebAuthSession({
    returnTo: '/apply/personal-info',
    requirement: {
      requiresAuthentication: true,
      minimumAssuranceLevel: 'aal1',
    },
  });

  return <ApplicationEntryPage />;
}
