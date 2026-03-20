import { ArrowLeft } from 'lucide-react';
import { RequireAuth } from '@acme-los/auth/web';
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
import { getApplicationAuthRequirement } from '../../../lib/application-auth';
import type { ApplicationDraft } from './form-model';
import { applyNavigationItems } from './form-model';
import {
  applicationSteps,
  getApplicationStep,
  type ApplicationStepSlug,
} from './step-definitions';
import { ApplicationStepFormCard } from './application-step-form-card';

type StepPageProps = {
  step: ApplicationStepSlug;
  initialDraft?: Partial<ApplicationDraft> | null;
};

export function ApplicationStepPage({
  step,
  initialDraft,
}: StepPageProps): React.ReactElement {
  const stepIndex = applicationSteps.findIndex((item) => item.slug === step);
  const currentStep = getApplicationStep(step);
  const previousStep = applicationSteps[stepIndex - 1];
  const nextStep = applicationSteps[stepIndex + 1];
  const progressValue = stepIndex + 1;

  return (
    <RequireAuth requirement={getApplicationAuthRequirement(step)}>
      <main className="min-h-screen text-[var(--foreground)]">
        <SiteHeader items={applyNavigationItems} variant="application" />

        <header className="border-b border-[var(--border)] bg-[color:var(--surface)/0.88] backdrop-blur-xl">
          <div className="site-shell py-4 lg:py-5">
            <div className="space-y-4">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--muted-foreground)]">
                    Step {stepIndex + 1} of {applicationSteps.length}
                  </p>
                  {previousStep ? (
                    <Link
                      href={`/apply/${previousStep.slug}`}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand)] transition hover:text-[var(--brand-strong)]"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      Back to {previousStep.shortLabel}
                    </Link>
                  ) : (
                    <Link
                      href="/"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand)] transition hover:text-[var(--brand-strong)]"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      Return home
                    </Link>
                  )}
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

            <div className="-mx-1 mt-5 flex gap-3 overflow-x-auto px-1 pb-3 pr-2 sm:mx-0 sm:px-0 sm:pb-1 sm:pr-0">
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

        <section className="site-shell py-7 lg:py-9">
          <div className="mx-auto max-w-5xl space-y-7">
            <Card className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]">
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
                <ApplicationStepFormCard
                  step={step}
                  nextStep={nextStep?.slug}
                  initialDraft={initialDraft}
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
                    The flow starts with identity and disclosures, then moves
                    into income, banking, pre-approval, signing, and funding.
                    That pacing keeps the experience trustworthy instead of
                    abrupt.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </RequireAuth>
  );
}
