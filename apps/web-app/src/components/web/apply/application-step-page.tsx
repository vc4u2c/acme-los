import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
} from '@acme-los/ui-web';
import { SiteHeader } from '../site-header';
import type { ApplicationFormState } from './form-model';
import { applyNavigationItems } from './form-model';
import {
  applicationSteps,
  getApplicationStep,
  type ApplicationStepSlug,
} from './step-definitions';
import { ApplicationStepFormCard } from './application-step-form-card';
import { ApplicationStepAnalyticsTracker } from '../analytics/application-step-analytics-tracker';

type StepPageProps = {
  step: ApplicationStepSlug;
  initialValues?: Partial<ApplicationFormState> | null;
};

export function ApplicationStepPage({
  step,
  initialValues,
}: StepPageProps): React.ReactElement {
  const stepIndex = applicationSteps.findIndex((item) => item.slug === step);
  const currentStep = getApplicationStep(step);
  const previousStep = applicationSteps[stepIndex - 1];
  const nextStep = applicationSteps[stepIndex + 1];
  const progressValue = stepIndex + 1;

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <ApplicationStepAnalyticsTracker step={step} />
      <SiteHeader items={applyNavigationItems} variant="application" />

      <header className="relative bg-[color:var(--surface)/0.88] backdrop-blur-xl before:pointer-events-none before:absolute before:bottom-0 before:left-4 before:right-4 before:h-3 before:content-[''] before:bg-[linear-gradient(180deg,var(--shadow-soft),transparent)] before:opacity-55 before:blur-md after:pointer-events-none after:absolute after:bottom-0 after:left-4 after:right-4 after:h-px after:content-[''] after:bg-[linear-gradient(90deg,transparent,var(--border),transparent)] after:opacity-85 sm:before:left-6 sm:before:right-6 sm:after:left-6 sm:after:right-6 lg:before:left-8 lg:before:right-8 lg:after:left-8 lg:after:right-8">
        <div className="site-shell py-4 lg:py-5">
          <div className="space-y-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--muted-foreground)]">
                  Step {stepIndex + 1} of {applicationSteps.length}
                </p>
              </div>
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
            aria-label={`Application progress: step ${stepIndex + 1} of ${applicationSteps.length}`}
            className="mt-6 bg-[var(--surface-accent)]"
            indicatorClassName="bg-[var(--brand)]"
          />

          <div className="-mx-1 mt-5 flex gap-2.5 overflow-x-auto px-1 pb-3 pr-2 sm:mx-0 sm:px-0 sm:pb-1 sm:pr-0">
            {applicationSteps.map((item, index) => {
              const isActive = item.slug === step;
              const isComplete = index < stepIndex;
              const stepHref = `/apply/${item.slug}`;
              const stepClassName = [
                'min-w-fit rounded-[1rem] border px-3.5 py-1.5 text-[13px] font-medium transition',
                isActive
                  ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)]'
                  : isComplete
                    ? 'border-[var(--accent)] bg-[var(--surface-spot)] text-[var(--accent-ink)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--brand)] hover:text-[var(--foreground)]',
              ].join(' ');

              if (item.slug === 'funding') {
                return (
                  <a
                    key={item.slug}
                    href={stepHref}
                    className={stepClassName}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    {index + 1}. {item.shortLabel}
                  </a>
                );
              }

              return (
                <Link
                  key={item.slug}
                  href={stepHref}
                  className={stepClassName}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {index + 1}. {item.shortLabel}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <section className="site-shell py-7 lg:py-9">
        <div className="mx-auto max-w-5xl space-y-7">
          <Card className="overflow-hidden rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
            <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-accent)] px-5 py-5 sm:px-6 sm:py-6">
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
            <CardContent className="p-5 sm:p-6 lg:p-7">
              <ApplicationStepFormCard
                step={step}
                previousStep={previousStep?.slug}
                nextStep={nextStep?.slug}
                initialValues={initialValues}
              />
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
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
          </div>
        </div>
      </section>
    </main>
  );
}
