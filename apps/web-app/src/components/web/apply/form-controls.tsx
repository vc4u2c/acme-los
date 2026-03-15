import * as React from 'react';
import {
  Checkbox,
  FormError,
  FormField,
  FormHint,
  FormLabel,
  RadioGroup,
  RadioGroupItem,
} from '@acme-los/ui-web';
import type { FieldErrors, Path, UseFormRegister } from 'react-hook-form';
import type { ApplicationDraft } from './form-model';

export const fieldClassName =
  'h-12 rounded-2xl border-[var(--border)] bg-[var(--surface-strong)] px-4 text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus-visible:ring-[var(--ring)]';

export const selectClassName =
  'flex h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 text-base text-[var(--foreground)] shadow-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--ring-soft)]';

export const textareaClassName =
  'min-h-[148px] w-full rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-base leading-7 text-[var(--foreground)] shadow-sm outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--ring-soft)]';

type FieldProps = {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
};

export type ChoiceOption = {
  label: string;
  value: string;
  description?: string;
};

type ChoiceGroupProps = {
  name: Path<ApplicationDraft>;
  label: string;
  hint?: string;
  options: ChoiceOption[];
  register: UseFormRegister<ApplicationDraft>;
  error?: string;
};

type CheckboxFieldProps = {
  name: Path<ApplicationDraft>;
  label: string;
  description: string;
  register: UseFormRegister<ApplicationDraft>;
  error?: string;
};

export function getErrorMessage(
  errors: FieldErrors<ApplicationDraft>,
  name: Path<ApplicationDraft>,
) {
  const error = errors[name as keyof FieldErrors<ApplicationDraft>];
  return typeof error?.message === 'string' ? error.message : undefined;
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: FieldProps): React.ReactElement {
  return (
    <FormField>
      <div className="space-y-1">
        <FormLabel htmlFor={id} className="text-[var(--muted-foreground)]">
          {label}
        </FormLabel>
        {hint ? <FormHint className="text-[var(--muted-foreground)]">{hint}</FormHint> : null}
      </div>
      {children}
      {error ? <FormError className="text-[var(--critical)]">{error}</FormError> : null}
    </FormField>
  );
}

export function ChoiceGroup({
  name,
  label,
  hint,
  options,
  register,
  error,
}: ChoiceGroupProps): React.ReactElement {
  return (
    <Field label={label} hint={hint} error={error}>
      <RadioGroup className="sm:grid-cols-2">
        {options.map((option) => (
          <RadioGroupItem
            key={option.value}
            value={option.value}
            {...register(name)}
            description={option.description}
            itemClassName="border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] peer-checked:border-[var(--brand)] peer-checked:bg-[var(--surface-accent)] peer-focus-visible:ring-[var(--ring-soft)]"
          >
            {option.label}
          </RadioGroupItem>
        ))}
      </RadioGroup>
    </Field>
  );
}

export function CheckboxField({
  name,
  label,
  description,
  register,
  error,
}: CheckboxFieldProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-sm">
        <Checkbox
          {...register(name)}
          className="mt-1 border-[var(--border-strong)] text-[var(--brand)] focus-visible:ring-[var(--ring)]"
        />
        <span className="space-y-1">
          <span className="block text-base font-semibold text-[var(--foreground)]">
            {label}
          </span>
          <span className="block text-sm leading-6 text-[var(--muted-foreground)]">
            {description}
          </span>
        </span>
      </label>
      {error ? <FormError className="text-[var(--critical)]">{error}</FormError> : null}
    </div>
  );
}
