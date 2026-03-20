'use client';

import { useForm, useStore } from '@tanstack/react-form';
import { defaultDraft, type ApplicationDraft } from './form-model';
import type { ApplicationStepSlug } from './step-definitions';

type UseApplicationFormOptions = {
  step: ApplicationStepSlug;
  initialValues?: Partial<ApplicationDraft>;
  onSubmit: (value: ApplicationDraft) => void | Promise<void>;
  onSubmitInvalid?: () => void;
};

export function useApplicationForm({
  step,
  initialValues,
  onSubmit,
  onSubmitInvalid,
}: UseApplicationFormOptions) {
  const form = useForm({
    formId: `apply-${step}`,
    defaultValues: { ...defaultDraft, ...initialValues },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    onSubmitInvalid: () => {
      onSubmitInvalid?.();
    },
  });

  const values = useStore(form.store, (state) => state.values);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  return {
    form,
    values,
    isSubmitting,
  };
}

export type ApplicationFormApi = ReturnType<typeof useApplicationForm>['form'];
