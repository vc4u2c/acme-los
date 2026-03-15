import type { ApplicationStepSlug } from './step-definitions';
import {
  defaultDraft,
  stepFieldNames,
  type ApplicationDraft,
} from './form-model';

const draftStorageKey = 'acme-los-installment-draft';

export function readDraft(): Partial<ApplicationDraft> {
  if (typeof window === 'undefined') {
    return {};
  }

  const raw = window.localStorage.getItem(draftStorageKey);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Partial<ApplicationDraft>)
      : {};
  } catch {
    return {};
  }
}

export function persistDraft(nextDraft: Partial<ApplicationDraft>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(draftStorageKey, JSON.stringify(nextDraft));
}

export function buildStepDraft(
  step: ApplicationStepSlug,
  values: Partial<ApplicationDraft>,
) {
  const currentDraft = readDraft();
  const updates = Object.fromEntries(
    stepFieldNames[step].map((fieldName) => [
      fieldName,
      values[fieldName] ?? defaultDraft[fieldName],
    ]),
  ) as Partial<ApplicationDraft>;

  return { ...currentDraft, ...updates };
}
