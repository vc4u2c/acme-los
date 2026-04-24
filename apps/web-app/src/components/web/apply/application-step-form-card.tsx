'use client';

import * as React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { createWebApiClient } from '@acme-los/api/web-client';
import { useRouter } from 'next/navigation';
import { Button } from '@acme-los/ui-web';
import { useApplicationForm } from './application-form';
import {
  defaultApplicationFormState,
  stepFieldNames,
  type ApplicationFormState,
} from './form-model';
import { renderStepFields } from './step-fields';
import {
  getApplicationStep,
  type ApplicationStepSlug,
} from './step-definitions';

type ApplicationStepFormCardProps = {
  step: ApplicationStepSlug;
  previousStep?: ApplicationStepSlug;
  nextStep?: ApplicationStepSlug;
  initialValues?: Partial<ApplicationFormState> | null;
};

export function ApplicationStepFormCard({
  step,
  previousStep,
  nextStep,
  initialValues,
}: ApplicationStepFormCardProps): React.ReactElement {
  const router = useRouter();
  const webApiClient = React.useMemo(() => createWebApiClient(), []);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const { form, isSubmitting } = useApplicationForm({
    step,
    initialValues: initialValues ?? undefined,
    onSubmit: async (value) => {
      setStatusMessage(null);

      try {
        if (nextStep) {
          await webApiClient.application.saveStep(step, {
            payload: buildStepPayload(step, value),
          });
          router.push(`/apply/${nextStep}`);
          return;
        }

        await webApiClient.application.submit({
          step,
          payload: buildStepPayload(step, value),
        });
        router.push('/');
      } catch (error) {
        setStatusMessage(
          error instanceof Error
            ? error.message
            : 'Unable to keep the secure application moving right now.',
        );
      }
    },
    onSubmitInvalid: () => {
      setStatusMessage(
        'Please review the highlighted fields before continuing.',
      );
    },
  });

  React.useEffect(() => {
    form.reset({ ...defaultApplicationFormState, ...(initialValues ?? {}) });
    setStatusMessage(null);
  }, [form, initialValues]);

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void form.handleSubmit();
    },
    [form],
  );

  return (
    <form className="space-y-7" onSubmit={onSubmit}>
      {renderStepFields(step, form)}

      {statusMessage ? (
        <div className="rounded-[1.35rem] border border-[var(--accent)] bg-[var(--surface-spot)] px-4 py-3 text-sm font-medium text-[var(--accent-ink)]">
          {statusMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:min-w-[196px]">
          {previousStep ? (
            <Button
              type="button"
              size="default"
              variant="outline"
              className="w-full rounded-[1rem] border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-accent)] sm:w-auto"
              onClick={() => router.push(`/apply/${previousStep}`)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to {getApplicationStep(previousStep).shortLabel}
            </Button>
          ) : null}
        </div>

        <Button
          type="submit"
          size="default"
          disabled={isSubmitting}
          className="rounded-[1rem] bg-[var(--brand)] px-6 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)] sm:min-w-[208px]"
        >
          {nextStep ? (
            <>
              Continue to {getApplicationStep(nextStep).shortLabel}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </>
          ) : (
            'Submit application'
          )}
        </Button>
      </div>
    </form>
  );
}

function buildStepPayload(
  step: ApplicationStepSlug,
  values: Partial<ApplicationFormState>,
): Record<string, unknown> {
  return Object.fromEntries(
    stepFieldNames[step].map((fieldName) => [
      fieldName,
      values[fieldName] ?? defaultApplicationFormState[fieldName],
    ]),
  );
}
