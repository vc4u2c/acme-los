import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  Textarea,
} from '@acme-los/ui-web';
import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import {
  CheckboxField,
  ChoiceGroup,
  Field,
  fieldClassName,
  getErrorMessage,
  selectClassName,
  textareaClassName,
} from './form-controls';
import type { ApplicationDraft } from './form-model';
import type { ApplicationStepSlug } from './step-definitions';

export function renderStepFields(
  step: ApplicationStepSlug,
  control: Control<ApplicationDraft>,
  register: UseFormRegister<ApplicationDraft>,
  errors: FieldErrors<ApplicationDraft>,
) {
  switch (step) {
    case 'personal-info':
      return (
        <div className="grid gap-6 md:grid-cols-2">
          <Field
            id="firstName"
            label="First name"
            error={getErrorMessage(errors, 'firstName')}
          >
            <Input id="firstName" {...register('firstName')} className={fieldClassName} />
          </Field>
          <Field
            id="lastName"
            label="Last name"
            error={getErrorMessage(errors, 'lastName')}
          >
            <Input id="lastName" {...register('lastName')} className={fieldClassName} />
          </Field>
          <Field id="email" label="Email" error={getErrorMessage(errors, 'email')}>
            <Input id="email" type="email" {...register('email')} className={fieldClassName} />
          </Field>
          <Field id="phone" label="Phone" error={getErrorMessage(errors, 'phone')}>
            <Input id="phone" {...register('phone')} className={fieldClassName} />
          </Field>
          <div className="md:col-span-2">
            <Field
              id="streetAddress"
              label="Street address"
              error={getErrorMessage(errors, 'streetAddress')}
            >
              <Input
                id="streetAddress"
                {...register('streetAddress')}
                className={fieldClassName}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field
              id="addressLine2"
              label="Address line 2"
              hint="Apartment, suite, or unit if needed."
              error={getErrorMessage(errors, 'addressLine2')}
            >
              <Input
                id="addressLine2"
                {...register('addressLine2')}
                className={fieldClassName}
              />
            </Field>
          </div>
          <Field id="city" label="City" error={getErrorMessage(errors, 'city')}>
            <Input id="city" {...register('city')} className={fieldClassName} />
          </Field>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="state" label="State" error={getErrorMessage(errors, 'state')}>
              <Input id="state" {...register('state')} className={fieldClassName} maxLength={2} />
            </Field>
            <Field id="zipCode" label="ZIP code" error={getErrorMessage(errors, 'zipCode')}>
              <Input id="zipCode" {...register('zipCode')} className={fieldClassName} />
            </Field>
          </div>
        </div>
      );
    case 'disclosures':
      return (
        <div className="space-y-6">
          <ChoiceGroup
            name="residencyStatus"
            label="Residency status"
            hint="Use the option that best matches the applicant's current status."
            register={register}
            error={getErrorMessage(errors, 'residencyStatus')}
            options={[
              { label: 'U.S. citizen', value: 'citizen' },
              { label: 'Permanent resident', value: 'permanent-resident' },
              { label: 'Other eligible status', value: 'other-eligible' },
            ]}
          />
          <ChoiceGroup
            name="activeMilitary"
            label="Active military status"
            register={register}
            error={getErrorMessage(errors, 'activeMilitary')}
            options={[
              {
                label: 'No',
                value: 'no',
                description: 'Continue through the standard consumer flow.',
              },
              {
                label: 'Yes',
                value: 'yes',
                description: 'Trigger the service-member review path and disclosures.',
              },
            ]}
          />
          <ChoiceGroup
            name="openBankruptcy"
            label="Open bankruptcy"
            register={register}
            error={getErrorMessage(errors, 'openBankruptcy')}
            options={[
              { label: 'No current bankruptcy', value: 'no' },
              { label: 'Currently open', value: 'yes' },
            ]}
          />
          <CheckboxField
            name="creditConsent"
            label="I consent to a soft credit review"
            description="This allows the application to move into pre-approval without affecting the applicant's credit score."
            register={register}
            error={getErrorMessage(errors, 'creditConsent')}
          />
        </div>
      );
    case 'employment-income':
      return (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Field
              id="employerName"
              label="Employer name"
              error={getErrorMessage(errors, 'employerName')}
            >
              <Input
                id="employerName"
                {...register('employerName')}
                className={fieldClassName}
              />
            </Field>
            <Field
              id="occupation"
              label="Occupation"
              error={getErrorMessage(errors, 'occupation')}
            >
              <Input id="occupation" {...register('occupation')} className={fieldClassName} />
            </Field>
          </div>
          <ChoiceGroup
            name="payFrequency"
            label="Pay frequency"
            register={register}
            error={getErrorMessage(errors, 'payFrequency')}
            options={[
              { label: 'Weekly', value: 'weekly' },
              { label: 'Biweekly', value: 'biweekly' },
              { label: 'Twice monthly', value: 'semi-monthly' },
              { label: 'Monthly', value: 'monthly' },
            ]}
          />
          <Field
            id="monthlyIncome"
            label="Monthly take-home income"
            hint="Enter a monthly estimate using numbers only or a simple currency format."
            error={getErrorMessage(errors, 'monthlyIncome')}
          >
            <Input
              id="monthlyIncome"
              {...register('monthlyIncome')}
              className={fieldClassName}
              inputMode="decimal"
              placeholder="4,500"
            />
          </Field>
          <Field
            id="otherIncomeNotes"
            label="Other income notes"
            hint="Optional context for side income, benefits, or seasonal variability."
            error={getErrorMessage(errors, 'otherIncomeNotes')}
          >
            <Textarea
              id="otherIncomeNotes"
              {...register('otherIncomeNotes')}
              className={textareaClassName}
              placeholder="Describe anything underwriters should know about the income picture."
            />
          </Field>
        </div>
      );
    case 'bank-card':
      return (
        <div className="space-y-6">
          <Field id="bankName" label="Bank name" error={getErrorMessage(errors, 'bankName')}>
            <Input id="bankName" {...register('bankName')} className={fieldClassName} />
          </Field>
          <div className="grid gap-6 md:grid-cols-2">
            <Field
              id="routingNumber"
              label="Routing number"
              error={getErrorMessage(errors, 'routingNumber')}
            >
              <Input
                id="routingNumber"
                {...register('routingNumber')}
                className={fieldClassName}
                inputMode="numeric"
              />
            </Field>
            <Field
              id="accountNumber"
              label="Account number"
              error={getErrorMessage(errors, 'accountNumber')}
            >
              <Input
                id="accountNumber"
                {...register('accountNumber')}
                className={fieldClassName}
                inputMode="numeric"
              />
            </Field>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Field
              id="debitCardLast4"
              label="Debit card last 4"
              hint="Fallback for repayments or funding confirmations."
              error={getErrorMessage(errors, 'debitCardLast4')}
            >
              <Input
                id="debitCardLast4"
                {...register('debitCardLast4')}
                className={fieldClassName}
                inputMode="numeric"
                maxLength={4}
              />
            </Field>
            <ChoiceGroup
              name="directDeposit"
              label="Direct deposit on file"
              register={register}
              error={getErrorMessage(errors, 'directDeposit')}
              options={[
                { label: 'Yes', value: 'yes' },
                { label: 'No', value: 'no' },
              ]}
            />
          </div>
        </div>
      );
    case 'pre-approval':
      return (
        <div className="space-y-6">
          <Field
            id="requestedAmount"
            label="Requested amount"
            hint="Use a simple figure like 1500 or 1,500."
            error={getErrorMessage(errors, 'requestedAmount')}
          >
            <Input
              id="requestedAmount"
              {...register('requestedAmount')}
              className={fieldClassName}
              inputMode="decimal"
              placeholder="1,500"
            />
          </Field>
          <Field
            id="loanPurpose"
            label="Loan purpose"
            error={getErrorMessage(errors, 'loanPurpose')}
          >
            <Controller
              name="loanPurpose"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger id="loanPurpose" className={selectClassName}>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unexpected-expense">Unexpected expense</SelectItem>
                    <SelectItem value="utilities-rent">Utilities or rent</SelectItem>
                    <SelectItem value="vehicle-repair">Vehicle repair</SelectItem>
                    <SelectItem value="medical">Medical expense</SelectItem>
                    <SelectItem value="debt-consolidation">Debt consolidation</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <CheckboxField
            name="softReviewConsent"
            label="I want to see a pre-approval result"
            description="This keeps the review moving while preserving a clear handoff into final documents and signing."
            register={register}
            error={getErrorMessage(errors, 'softReviewConsent')}
          />
        </div>
      );
    case 'documents-signing':
      return (
        <div className="space-y-6">
          <CheckboxField
            name="governmentIdReady"
            label="Government ID is ready"
            description="A current government-issued ID will be required for final verification."
            register={register}
            error={getErrorMessage(errors, 'governmentIdReady')}
          />
          <CheckboxField
            name="proofOfIncomeReady"
            label="Proof of income is ready"
            description="Recent pay stubs, deposits, or other income evidence help keep underwriting moving."
            register={register}
            error={getErrorMessage(errors, 'proofOfIncomeReady')}
          />
          <Field
            id="typedSignature"
            label="Typed signature"
            hint="Type the applicant name exactly as it should appear on the document packet."
            error={getErrorMessage(errors, 'typedSignature')}
          >
            <Input
              id="typedSignature"
              {...register('typedSignature')}
              className={fieldClassName}
            />
          </Field>
          <CheckboxField
            name="electronicConsent"
            label="I consent to electronic delivery and signing"
            description="This confirms the applicant can receive disclosures and sign documents electronically."
            register={register}
            error={getErrorMessage(errors, 'electronicConsent')}
          />
        </div>
      );
    case 'funding':
      return (
        <div className="space-y-6">
          <ChoiceGroup
            name="fundingMethod"
            label="Funding method"
            register={register}
            error={getErrorMessage(errors, 'fundingMethod')}
            options={[
              {
                label: 'Direct deposit',
                value: 'direct-deposit',
                description: 'Send approved funds to the verified bank account on file.',
              },
              {
                label: 'Debit card transfer',
                value: 'debit-card',
                description: 'Use the verified debit card when instant transfer is available.',
              },
            ]}
          />
          <Field
            id="deliveryDestination"
            label="Delivery destination"
            error={getErrorMessage(errors, 'deliveryDestination')}
          >
            <Controller
              name="deliveryDestination"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger id="deliveryDestination" className={selectClassName}>
                    <SelectValue placeholder="Choose destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary-bank">Primary bank account</SelectItem>
                    <SelectItem value="verified-card">Verified debit card</SelectItem>
                    <SelectItem value="best-available">
                      Best available verified method
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <CheckboxField
            name="finalAuthorization"
            label="I understand the final underwriting review comes next"
            description="This acknowledges the submission, the final decision step, and the expected funding timeline after approval."
            register={register}
            error={getErrorMessage(errors, 'finalAuthorization')}
          />
        </div>
      );
  }
}
