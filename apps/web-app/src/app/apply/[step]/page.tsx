import { notFound } from 'next/navigation';
import {
  readServerApplicationStepState,
  requireServerWebAuthSession,
} from '@acme-los/api/web-server';
import { ApplicationStepPage } from '../../../components/web/apply/application-step-page';
import type { ApplicationFormState } from '../../../components/web/apply/form-model';
import {
  applicationStepSlugs,
  type ApplicationStepSlug,
} from '../../../components/web/apply/step-definitions';
import { getApplicationPageAuthRequirement } from '../../../lib/application-auth';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export function generateStaticParams() {
  return applicationStepSlugs.map((step) => ({ step }));
}

export default async function ApplicationStepRoute({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;

  if (!applicationStepSlugs.includes(step as ApplicationStepSlug)) {
    notFound();
  }

  const session = await requireServerWebAuthSession({
    returnTo: `/apply/${step}`,
    requirement: getApplicationPageAuthRequirement(step as ApplicationStepSlug),
  });
  const stepState = await readServerApplicationStepState(
    session,
    step as ApplicationStepSlug,
  );

  return (
    <ApplicationStepPage
      key={step}
      step={step as ApplicationStepSlug}
      initialValues={stepState?.payload as Partial<ApplicationFormState> | null}
    />
  );
}
