import { notFound } from 'next/navigation';
import { ApplicationStepPage } from '../../../components/web/apply/application-step-page';
import {
  applicationStepSlugs,
  type ApplicationStepSlug,
} from '../../../components/web/apply/step-definitions';
import { getApplicationAuthRequirement } from '../../../lib/application-auth';
import { requireServerWebAuthSession } from '../../../server/web-api/server-session';

export function generateStaticParams() {
  return applicationStepSlugs.map((step) => ({ step }));
}

export const dynamicParams = false;

export default async function ApplicationStepRoute({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;

  if (!applicationStepSlugs.includes(step as ApplicationStepSlug)) {
    notFound();
  }

  await requireServerWebAuthSession({
    returnTo: `/apply/${step}`,
    requirement: getApplicationAuthRequirement(step as ApplicationStepSlug),
  });

  return <ApplicationStepPage key={step} step={step as ApplicationStepSlug} />;
}
