'use client';

import * as React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { createWebApiClient } from '@acme-los/api/web-client';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@acme-los/ui-web';
import { useAuthSession } from '@acme-los/auth/web';
import type { AnalyticsRuntimeConfig } from '../../../lib/analytics/config';
import {
  type AcmeAnalyticsEvent,
  type AnalyticsAuthState,
  bucketAnalyticsFailureReason,
  buildApplicationStepEvent,
  buildApplicationSubmitEvent,
  buildFundingStepUpEvent,
  toAnalyticsAuthState,
} from '../../../lib/analytics/data-layer';
import { useAnalytics } from '../analytics/analytics-provider';
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

type AnalyticsEventCommon = {
  config: AnalyticsRuntimeConfig;
  pathname: string;
  pageTitle: string;
  origin: string;
  authState: AnalyticsAuthState;
  assuranceLevel: string;
};

export function ApplicationStepFormCard({
  step,
  previousStep,
  nextStep,
  initialValues,
}: ApplicationStepFormCardProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useAuthSession();
  const { config, trackEvent } = useAnalytics();
  const webApiClient = React.useMemo(() => createWebApiClient(), []);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const trackJourneyEvent = React.useCallback(
    (build: (common: AnalyticsEventCommon) => AcmeAnalyticsEvent) => {
      if (!config.enabled) {
        return;
      }

      trackEvent(
        build({
          config,
          pathname: pathname ?? `/apply/${step}`,
          pageTitle: document.title,
          origin: window.location.origin,
          authState: toAnalyticsAuthState(
            session.status,
            session.isAuthenticated,
          ),
          assuranceLevel: session.assuranceLevel,
        }),
        {
          sendToGa4: true,
        },
      );
    },
    [config, pathname, session, step, trackEvent],
  );
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
          trackJourneyEvent((common) =>
            buildApplicationStepEvent({
              ...common,
              eventName: 'application_step_complete',
              step,
              stepDestination: nextStep,
              result: 'success',
            }),
          );

          if (nextStep === 'funding') {
            trackJourneyEvent((common) =>
              buildFundingStepUpEvent({
                ...common,
                eventName: 'funding_step_up_started',
                result: 'started',
              }),
            );
          }

          if (nextStep === 'funding') {
            window.location.assign('/apply/funding');
            return;
          }

          router.push(`/apply/${nextStep}`);
          return;
        }

        trackJourneyEvent((common) =>
          buildApplicationSubmitEvent({
            ...common,
            eventName: 'application_submit_clicked',
            step,
          }),
        );
        await webApiClient.application.submit({
          step,
          payload: buildStepPayload(step, value),
        });
        trackJourneyEvent((common) =>
          buildApplicationStepEvent({
            ...common,
            eventName: 'application_step_complete',
            step,
            result: 'success',
          }),
        );
        trackJourneyEvent((common) =>
          buildApplicationSubmitEvent({
            ...common,
            eventName: 'application_submit_succeeded',
            step,
          }),
        );
        trackJourneyEvent((common) =>
          buildApplicationSubmitEvent({
            ...common,
            eventName: 'generate_lead',
            step,
          }),
        );
        router.push('/');
      } catch (error) {
        if (!nextStep) {
          trackJourneyEvent((common) =>
            buildApplicationSubmitEvent({
              ...common,
              eventName: 'application_submit_failed',
              step,
              failureReasonBucket: bucketAnalyticsFailureReason(error),
            }),
          );
        }

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
    <form className="space-y-5" onSubmit={onSubmit}>
      {renderStepFields(step, form)}

      {statusMessage ? (
        <div className="rounded-[1rem] border border-[var(--accent)] bg-[var(--surface-spot)] px-3 py-2.5 text-sm font-medium text-[var(--accent-ink)]">
          {statusMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
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
