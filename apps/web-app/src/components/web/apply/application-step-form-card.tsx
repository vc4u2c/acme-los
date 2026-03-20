'use client';

import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle, Button } from '@acme-los/ui-web';
import { useApplicationForm } from './application-form';
import { buildStepDraft, persistDraft, readDraft } from './draft-storage';
import { defaultDraft, type ApplicationDraft } from './form-model';
import { renderStepFields } from './step-fields';
import {
  type ApplicationStepSlug,
  getApplicationStep,
} from './step-definitions';

type ApplicationStepFormCardProps = {
  step: ApplicationStepSlug;
  nextStep?: ApplicationStepSlug;
  initialDraft?: Partial<ApplicationDraft> | null;
};

export function ApplicationStepFormCard({
  step,
  nextStep,
  initialDraft,
}: ApplicationStepFormCardProps): React.ReactElement {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const { form, values, isSubmitting } = useApplicationForm({
    step,
    initialValues: initialDraft ?? undefined,
    onSubmit: async (value) => {
      persistDraft(buildStepDraft(step, value));

      if (nextStep) {
        router.push(`/apply/${nextStep}`);
        return;
      }

      setStatusMessage('Application saved. Returning home.');
      router.push('/');
    },
    onSubmitInvalid: () => {
      setStatusMessage(
        'Please review the highlighted fields before continuing.',
      );
    },
  });

  React.useEffect(() => {
    const storedDraft = readDraft();
    form.reset({ ...defaultDraft, ...(initialDraft ?? {}), ...storedDraft });
    setStatusMessage(null);
    setIsHydrated(true);
  }, [form, initialDraft]);

  React.useEffect(() => {
    if (!isHydrated) {
      return;
    }

    persistDraft(buildStepDraft(step, values));
  }, [isHydrated, step, values]);

  const saveDraftLocally = React.useCallback(() => {
    persistDraft(buildStepDraft(step, values));
    setStatusMessage('Draft saved in this browser.');
  }, [step, values]);

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void form.handleSubmit();
    },
    [form],
  );

  return (
    <form className="space-y-8" onSubmit={onSubmit}>
      {renderStepFields(step, form)}

      <Alert className="rounded-[1.4rem] border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <AlertTitle className="text-sm text-[var(--foreground)]">
              Your progress saves in this browser
            </AlertTitle>
            <AlertDescription className="text-[var(--muted-foreground)]">
              Use Save draft before leaving if you want a clear checkpoint.
            </AlertDescription>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-accent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
            Local draft
          </span>
        </div>
        {statusMessage ? (
          <p className="mt-3 text-sm font-medium text-[var(--brand)]">
            {statusMessage}
          </p>
        ) : null}
      </Alert>

      <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={saveDraftLocally}
          className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-5 text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
        >
          Save draft
        </Button>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="rounded-full bg-[var(--brand)] px-7 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)]"
        >
          {nextStep ? (
            <>
              Continue to {getApplicationStep(nextStep).shortLabel}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </>
          ) : (
            'Finish and return home'
          )}
        </Button>
      </div>
    </form>
  );
}
