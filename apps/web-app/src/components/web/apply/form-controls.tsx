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
        {hint ? (
          <FormHint className="text-[var(--muted-foreground)]">{hint}</FormHint>
        ) : null}
      </div>
      {children}
      {error ? (
        <FormError className="text-[var(--critical)]">{error}</FormError>
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
      {(field) => (
        <Field
          id={String(name)}
          label={label}
          hint={hint}
          error={getFieldError(field.state.meta.errors)}
        >
          <Input
            id={String(name)}
            name={field.name}
            value={String(field.state.value ?? '')}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            className={[fieldClassName, className].filter(Boolean).join(' ')}
            {...props}
          />
        </Field>
      )}
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
      {(field) => (
        <Field
          id={String(name)}
          label={label}
          hint={hint}
          error={getFieldError(field.state.meta.errors)}
        >
          <Textarea
            id={String(name)}
            name={field.name}
            value={String(field.state.value ?? '')}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            className={[textareaClassName, className].filter(Boolean).join(' ')}
            {...props}
          />
        </Field>
      )}
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
      {(field) => (
        <Field
          id={String(name)}
          label={label}
          hint={hint}
          error={getFieldError(field.state.meta.errors)}
        >
          <Select
            value={
              typeof field.state.value === 'string' && field.state.value
                ? field.state.value
                : undefined
            }
            onValueChange={field.handleChange}
          >
            <SelectTrigger
              id={String(name)}
              className={selectClassName}
              onBlur={field.handleBlur}
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
      )}
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
}: ChoiceGroupProps) {
  return (
    <form.Field
      name={name}
      validators={{
        onBlur: ({ value }) => validateStepField(step, name, value),
        onSubmit: ({ value }) => validateStepField(step, name, value),
      }}
    >
      {(field) => (
        <Field
          label={label}
          hint={hint}
          error={getFieldError(field.state.meta.errors)}
        >
          <RadioGroup className="sm:grid-cols-2">
            {options.map((option) => (
              <RadioGroupItem
                key={option.value}
                name={field.name}
                value={option.value}
                checked={field.state.value === option.value}
                onChange={() => field.handleChange(option.value)}
                onBlur={field.handleBlur}
                description={option.description}
                itemClassName="border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] peer-checked:border-[var(--brand)] peer-checked:bg-[var(--surface-accent)] peer-focus-visible:ring-[var(--ring-soft)]"
              >
                {option.label}
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </Field>
      )}
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
      {(field) => (
        <div className="space-y-2">
          <label className="flex items-start gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-sm">
            <Checkbox
              name={field.name}
              checked={Boolean(field.state.value)}
              onBlur={field.handleBlur}
              onChange={(event) =>
                field.handleChange(event.currentTarget.checked)
              }
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
          {getFieldError(field.state.meta.errors) ? (
            <FormError className="text-[var(--critical)]">
              {getFieldError(field.state.meta.errors)}
            </FormError>
          ) : null}
        </div>
      )}
    </form.Field>
  );
}
