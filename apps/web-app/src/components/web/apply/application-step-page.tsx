'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Progress,
  CardTitle,
} from '@acme-los/ui-web';
import {
  useForm,
  type Resolver,
} from 'react-hook-form';
import { SiteHeader } from '../site-header';
import {
  buildStepDraft,
  persistDraft,
  readDraft,
} from './draft-storage';
import {
  applyNavigationItems,
  defaultDraft,
  type ApplicationDraft,
} from './form-model';
import { schemaMap } from './schemas';
import { renderStepFields } from './step-fields';
import {
  applicationSteps,
  getApplicationStep,
  type ApplicationStepSlug,
} from './step-definitions';

type StepPageProps = {
  step: ApplicationStepSlug;
};

export function ApplicationStepPage({
  step,
}: StepPageProps): React.ReactElement {
  const router = useRouter();
  const stepIndex = applicationSteps.findIndex((item) => item.slug === step);
  const currentStep = getApplicationStep(step);
  const previousStep = applicationSteps[stepIndex - 1];
  const nextStep = applicationSteps[stepIndex + 1];
  const progressValue = stepIndex + 1;
  const resolver = zodResolver(schemaMap[step]) as unknown as Resolver<ApplicationDraft>;
  const {
    control,
    register,
    reset,
    watch,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationDraft>({
    resolver,
    defaultValues: defaultDraft,
    mode: 'onBlur',
    shouldUnregister: true,
  });
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    const storedDraft = readDraft();
    reset({ ...defaultDraft, ...storedDraft });
    setStatusMessage(null);
    setIsHydrated(true);
  }, [reset]);

  React.useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const subscription = watch((values, info) => {
      if (!info.name) {
        return;
      }

      persistDraft(buildStepDraft(step, values as Partial<ApplicationDraft>));
    });

    return () => subscription.unsubscribe();
  }, [isHydrated, step, watch]);

  const saveDraftLocally = React.useCallback(() => {
    persistDraft(buildStepDraft(step, getValues()));
    setStatusMessage('Draft saved in this browser.');
  }, [getValues, step]);

  const goToPreviousStep = React.useCallback(() => {
    if (!previousStep) {
      return;
    }

    persistDraft(buildStepDraft(step, getValues()));
    router.push(`/apply/${previousStep.slug}`);
  }, [getValues, previousStep, router, step]);

  const onSubmit = handleSubmit((values) => {
    persistDraft(buildStepDraft(step, values));

    if (nextStep) {
      router.push(`/apply/${nextStep.slug}`);
      return;
    }

    setStatusMessage('Application saved. Returning home.');
    router.push('/');
  });

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={applyNavigationItems} />

      <header className="border-b border-[var(--border)] bg-[color:var(--surface)/0.88] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-5 py-4 lg:px-8 lg:py-5">
          <div className="space-y-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-[var(--brand)] transition hover:text-[var(--brand-strong)]"
            >
              Return home
            </Link>
            <div className="space-y-2.5">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--muted-foreground)]">
                Step {stepIndex + 1} of {applicationSteps.length}
              </p>
              <h1 className="font-display text-4xl leading-tight text-[var(--foreground)] lg:text-5xl">
                {currentStep.title}
              </h1>
              <p className="max-w-3xl text-base leading-8 text-[var(--muted-foreground)] lg:text-lg">
                {currentStep.description}
              </p>
            </div>
          </div>

          <Progress
            value={progressValue}
            max={applicationSteps.length}
            className="mt-6 bg-[var(--surface-accent)]"
            indicatorClassName="bg-[var(--brand)]"
          />

          <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
            {applicationSteps.map((item, index) => {
              const isActive = item.slug === step;
              const isComplete = index < stepIndex;

              return (
                <Link
                  key={item.slug}
                  href={`/apply/${item.slug}`}
                  className={[
                    'min-w-fit rounded-full border px-4 py-2 text-sm font-medium transition',
                    isActive
                      ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)]'
                      : isComplete
                        ? 'border-[var(--accent)] bg-[var(--surface-spot)] text-[var(--accent-ink)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--brand)] hover:text-[var(--foreground)]',
                  ].join(' ')}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {index + 1}. {item.shortLabel}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-7 px-5 py-7 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-9">
        <Card className="overflow-hidden rounded-[2rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)]">
          <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-accent)]">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
              {currentStep.supportTitle}
            </p>
            <CardTitle className="font-display text-3xl text-[var(--foreground)]">
              {currentStep.title}
            </CardTitle>
            <CardDescription className="max-w-3xl text-base leading-7 text-[var(--muted-foreground)]">
              {currentStep.supportCopy}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 lg:p-8">
            <form className="space-y-8" onSubmit={onSubmit}>
              {renderStepFields(step, control, register, errors)}

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
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={saveDraftLocally}
                    className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-5 text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
                  >
                    Save draft
                  </Button>
                  {previousStep ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={goToPreviousStep}
                      className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] px-5 text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
                    >
                      Back to {previousStep.shortLabel}
                    </Button>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="rounded-full bg-[var(--brand)] px-7 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)]"
                >
                  {nextStep
                    ? `Continue to ${nextStep.shortLabel}`
                    : 'Finish and return home'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                Full application path
              </p>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                Keep the steps visible.
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {applicationSteps.map((item, index) => (
                <div
                  key={item.slug}
                  className={[
                    'rounded-[1.4rem] border px-4 py-4 transition',
                    item.slug === step
                      ? 'border-[var(--brand)] bg-[var(--surface-accent)]'
                      : 'border-[var(--border)] bg-[var(--surface-strong)]',
                  ].join(' ')}
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Step {index + 1}
                  </p>
                  <p className="mt-1 text-base font-semibold text-[var(--foreground)]">
                    {item.label}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[1.9rem] border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-lg shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--accent-ink)]">
                This step focuses on
              </p>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                {currentStep.supportTitle}
              </CardTitle>
              <CardDescription className="text-base leading-7 text-[var(--muted-foreground)]">
                {currentStep.supportCopy}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentStep.highlights.map((highlight) => (
                <div
                  key={highlight}
                  className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)]"
                >
                  {highlight}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[1.9rem] border-[var(--accent)] bg-[var(--surface-spot)] text-[var(--foreground)] shadow-lg shadow-[color:var(--shadow-soft)]">
            <CardHeader>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--accent-ink)]">
                Confidence note
              </p>
              <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                Sensitive information arrives when it makes sense.
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-8 text-[var(--foreground)]">
                The flow starts with identity and disclosures, then moves into
                income, banking, pre-approval, signing, and funding. That
                pacing keeps the experience trustworthy instead of abrupt.
              </p>
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}
