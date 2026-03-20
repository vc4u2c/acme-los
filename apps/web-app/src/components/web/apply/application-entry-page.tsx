import { RequireAuth } from '@acme-los/auth/web';
import { ApplicationEntryRedirect } from './application-entry-redirect';

const firstApplicationStepPath = '/apply/personal-info';

export function ApplicationEntryPage(): React.ReactElement {
  return (
    <RequireAuth
      requirement={{
        requiresAuthentication: true,
        minimumAssuranceLevel: 'aal1',
      }}
    >
      <ApplicationEntryRedirect
        firstApplicationStepPath={firstApplicationStepPath}
      >
        <main className="site-shell flex min-h-[65vh] items-center justify-center py-16 text-[var(--foreground)]">
          <div className="w-full max-w-xl rounded-[2rem] border border-[var(--border)] bg-[color:var(--surface)/0.96] p-8 shadow-2xl shadow-[color:var(--shadow-soft)]">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
              Secure application access
            </p>
            <h1 className="mt-4 font-display text-4xl text-[var(--foreground)]">
              Opening your application
            </h1>
            <p className="mt-4 text-base leading-8 text-[var(--muted-foreground)]">
              We are restoring your customer session and taking you to the first
              application step now.
            </p>
          </div>
        </main>
      </ApplicationEntryRedirect>
    </RequireAuth>
  );
}
