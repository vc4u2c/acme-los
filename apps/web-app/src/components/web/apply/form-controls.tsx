import * as React from 'react';
import {
  Checkbox,
  FormError,
  FormField,
  FormHint,
  FormLabel,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@acme-los/ui-web';
import type { ApplicationFormApi } from './application-form';
import type { ApplicationFieldName } from './form-model';
import { validateStepField } from './schemas';
import type { ApplicationStepSlug } from './step-definitions';

export const fieldClassName =
  'h-11 rounded-[1.2rem] border-[var(--border)] bg-[var(--surface-strong)] px-3.5 text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus-visible:ring-[var(--ring)]';

export const selectClassName =
  'flex h-11 w-full rounded-[1.2rem] border border-[var(--border)] bg-[var(--surface-strong)] px-3.5 text-[15px] text-[var(--foreground)] shadow-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--ring-soft)]';

export const textareaClassName =
  'min-h-[148px] w-full rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-base leading-7 text-[var(--foreground)] shadow-sm outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--ring-soft)]';

type FieldProps = {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
  hintId?: string;
  errorId?: string;
  children: React.ReactNode;
};

export type ChoiceOption = {
  label: string;
  value: string;
  description?: string;
};

type BaseControlledFieldProps = {
  form: ApplicationFormApi;
  step: ApplicationStepSlug;
  name: ApplicationFieldName;
  label: string;
  hint?: string;
};

type TextFieldProps = BaseControlledFieldProps &
  Omit<React.ComponentPropsWithoutRef<typeof Input>, 'name' | 'form'>;

type TextareaFieldProps = BaseControlledFieldProps &
  Omit<React.ComponentPropsWithoutRef<typeof Textarea>, 'name' | 'form'>;

type SelectFieldProps = BaseControlledFieldProps & {
  placeholder: string;
  options: ChoiceOption[];
};

type ChoiceGroupProps = BaseControlledFieldProps & {
  options: ChoiceOption[];
  itemClassName?: string;
  labelClassName?: string;
  descriptionClassName?: string;
};

type CheckboxFieldProps = BaseControlledFieldProps & {
  description: string;
};

function normalizeErrorMessage(error: unknown): string | undefined {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (Array.isArray(error)) {
    for (const item of error) {
      const nested = normalizeErrorMessage(item);
      if (nested) {
        return nested;
      }
    }
  }

  if (typeof error === 'object' && error !== null) {
    const message = Reflect.get(error, 'message');
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return undefined;
}

export function getFieldError(errors: unknown[]) {
  for (const error of errors) {
    const message = normalizeErrorMessage(error);
    if (message) {
      return message;
    }
  }

  return undefined;
}

function joinDescribedBy(
  ...ids: Array<string | undefined>
): string | undefined {
  const value = ids.filter(Boolean).join(' ');
  return value || undefined;
}

export function Field({
  id,
  label,
  hint,
  error,
  hintId,
  errorId,
  children,
}: FieldProps): React.ReactElement {
  return (
    <FormField>
      <div className="space-y-1">
        <FormLabel htmlFor={id} className="text-[var(--muted-foreground)]">
          {label}
        </FormLabel>
        {hint ? (
          <FormHint id={hintId} className="text-[var(--muted-foreground)]">
            {hint}
          </FormHint>
        ) : null}
      </div>
      {children}
      {error ? (
        <FormError id={errorId} className="text-[var(--critical)]">
          {error}
        </FormError>
      ) : null}
    </FormField>
  );
}

export function TextInputField({
  form,
  step,
  name,
  label,
  hint,
  className,
  ...props
}: TextFieldProps) {
  return (
    <form.Field
      name={name}
      validators={{
        onBlur: ({ value }) => validateStepField(step, name, value),
        onSubmit: ({ value }) => validateStepField(step, name, value),
      }}
    >
      {(field) => {
        const fieldId = String(name);
        const hintId = hint ? `${fieldId}-hint` : undefined;
        const error = getFieldError(field.state.meta.errors);
        const errorId = error ? `${fieldId}-error` : undefined;

        return (
          <Field
            id={fieldId}
            label={label}
            hint={hint}
            hintId={hintId}
            error={error}
            errorId={errorId}
          >
            <Input
              id={fieldId}
              name={field.name}
              value={String(field.state.value ?? '')}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-describedby={joinDescribedBy(hintId, errorId)}
              aria-invalid={error ? true : undefined}
              className={[fieldClassName, className].filter(Boolean).join(' ')}
              {...props}
            />
          </Field>
        );
      }}
    </form.Field>
  );
}

export function TextareaField({
  form,
  step,
  name,
  label,
  hint,
  className,
  ...props
}: TextareaFieldProps) {
  return (
    <form.Field
      name={name}
      validators={{
        onBlur: ({ value }) => validateStepField(step, name, value),
        onSubmit: ({ value }) => validateStepField(step, name, value),
      }}
    >
      {(field) => {
        const fieldId = String(name);
        const hintId = hint ? `${fieldId}-hint` : undefined;
        const error = getFieldError(field.state.meta.errors);
        const errorId = error ? `${fieldId}-error` : undefined;

        return (
          <Field
            id={fieldId}
            label={label}
            hint={hint}
            hintId={hintId}
            error={error}
            errorId={errorId}
          >
            <Textarea
              id={fieldId}
              name={field.name}
              value={String(field.state.value ?? '')}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-describedby={joinDescribedBy(hintId, errorId)}
              aria-invalid={error ? true : undefined}
              className={[textareaClassName, className]
                .filter(Boolean)
                .join(' ')}
              {...props}
            />
          </Field>
        );
      }}
    </form.Field>
  );
}

export function SelectField({
  form,
  step,
  name,
  label,
  hint,
  placeholder,
  options,
}: SelectFieldProps) {
  return (
    <form.Field
      name={name}
      validators={{
        onBlur: ({ value }) => validateStepField(step, name, value),
        onSubmit: ({ value }) => validateStepField(step, name, value),
      }}
    >
      {(field) => {
        const fieldId = String(name);
        const hintId = hint ? `${fieldId}-hint` : undefined;
        const error = getFieldError(field.state.meta.errors);
        const errorId = error ? `${fieldId}-error` : undefined;

        return (
          <Field
            id={fieldId}
            label={label}
            hint={hint}
            hintId={hintId}
            error={error}
            errorId={errorId}
          >
            <Select
              value={
                typeof field.state.value === 'string' ? field.state.value : ''
              }
              onValueChange={field.handleChange}
            >
              <SelectTrigger
                id={fieldId}
                className={selectClassName}
                onBlur={field.handleBlur}
                aria-describedby={joinDescribedBy(hintId, errorId)}
                aria-invalid={error ? true : undefined}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        );
      }}
    </form.Field>
  );
}

export function ChoiceGroupField({
  form,
  step,
  name,
  label,
  hint,
  options,
  itemClassName,
  labelClassName,
  descriptionClassName,
}: ChoiceGroupProps) {
  return (
    <form.Field
      name={name}
      validators={{
        onBlur: ({ value }) => validateStepField(step, name, value),
        onSubmit: ({ value }) => validateStepField(step, name, value),
      }}
    >
      {(field) => {
        const fieldId = String(name);
        const legendId = `${fieldId}-legend`;
        const hintId = hint ? `${fieldId}-hint` : undefined;
        const error = getFieldError(field.state.meta.errors);
        const errorId = error ? `${fieldId}-error` : undefined;

        return (
          <fieldset className="space-y-2.5">
            <div className="space-y-1">
              <legend
                id={legendId}
                className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]"
              >
                {label}
              </legend>
              {hint ? (
                <FormHint
                  id={hintId}
                  className="text-[var(--muted-foreground)]"
                >
                  {hint}
                </FormHint>
              ) : null}
            </div>
            <RadioGroup
              className="sm:grid-cols-2"
              aria-labelledby={legendId}
              aria-describedby={joinDescribedBy(hintId, errorId)}
              aria-invalid={error ? true : undefined}
            >
              {options.map((option) => (
                <RadioGroupItem
                  key={option.value}
                  id={`${fieldId}-${option.value}`}
                  name={field.name}
                  value={option.value}
                  checked={field.state.value === option.value}
                  onChange={() => field.handleChange(option.value)}
                  onBlur={field.handleBlur}
                  aria-describedby={joinDescribedBy(hintId, errorId)}
                  aria-invalid={error ? true : undefined}
                  description={option.description}
                  itemClassName={[
                    'border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] peer-checked:border-[var(--brand)] peer-checked:bg-[var(--surface-accent)] peer-focus-visible:ring-[var(--ring-soft)]',
                    itemClassName,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  labelClassName={labelClassName}
                  descriptionClassName={descriptionClassName}
                >
                  {option.label}
                </RadioGroupItem>
              ))}
            </RadioGroup>
            {error ? (
              <FormError id={errorId} className="text-[var(--critical)]">
                {error}
              </FormError>
            ) : null}
          </fieldset>
        );
      }}
    </form.Field>
  );
}

export function CheckboxField({
  form,
  step,
  name,
  label,
  description,
}: CheckboxFieldProps) {
  return (
    <form.Field
      name={name}
      validators={{
        onBlur: ({ value }) => validateStepField(step, name, value),
        onSubmit: ({ value }) => validateStepField(step, name, value),
      }}
    >
      {(field) => {
        const fieldId = String(name);
        const descriptionId = `${fieldId}-description`;
        const error = getFieldError(field.state.meta.errors);
        const errorId = error ? `${fieldId}-error` : undefined;

        return (
          <div className="space-y-2">
            <label className="flex items-start gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-sm">
              <Checkbox
                id={fieldId}
                name={field.name}
                checked={Boolean(field.state.value)}
                onBlur={field.handleBlur}
                onChange={(event) =>
                  field.handleChange(event.currentTarget.checked)
                }
                aria-describedby={joinDescribedBy(descriptionId, errorId)}
                aria-invalid={error ? true : undefined}
                className="mt-1 border-[var(--border-strong)] text-[var(--brand)] focus-visible:ring-[var(--ring)]"
              />
              <span className="space-y-1">
                <span className="block text-base font-semibold text-[var(--foreground)]">
                  {label}
                </span>
                <span
                  id={descriptionId}
                  className="block text-sm leading-6 text-[var(--muted-foreground)]"
                >
                  {description}
                </span>
              </span>
            </label>
            {error ? (
              <FormError id={errorId} className="text-[var(--critical)]">
                {error}
              </FormError>
            ) : null}
          </div>
        );
      }}
    </form.Field>
  );
}
