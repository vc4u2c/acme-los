import { notFound } from 'next/navigation';
import { ApplicationStepPage } from '../../../components/web/apply/application-step-page';
import {
  applicationStepSlugs,
  type ApplicationStepSlug,
} from '../../../components/web/apply/step-definitions';

export default async function ApplicationStepRoute({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;

  if (!applicationStepSlugs.includes(step as ApplicationStepSlug)) {
    notFound();
  }

  return <ApplicationStepPage key={step} step={step as ApplicationStepSlug} />;
}
