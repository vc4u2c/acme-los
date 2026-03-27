import type { ApplicationFormApi } from './application-form';
import {
  CheckboxField,
  ChoiceGroupField,
  SelectField,
  TextareaField,
  TextInputField,
} from './form-controls';
import type { ApplicationStepSlug } from './step-definitions';

export function renderStepFields(
  step: ApplicationStepSlug,
  form: ApplicationFormApi,
) {
  switch (step) {
    case 'personal-info':
      return (
        <div className="grid gap-6 md:grid-cols-2">
          <TextInputField
            form={form}
            step={step}
            name="firstName"
            label="First name"
          />
          <TextInputField
            form={form}
            step={step}
            name="lastName"
            label="Last name"
          />
          <TextInputField
            form={form}
            step={step}
            name="email"
            label="Email"
            type="email"
          />
          <TextInputField form={form} step={step} name="phone" label="Phone" />
          <div className="md:col-span-2">
            <TextInputField
              form={form}
              step={step}
              name="streetAddress"
              label="Street address"
            />
          </div>
          <div className="md:col-span-2">
            <TextInputField
              form={form}
              step={step}
              name="addressLine2"
              label="Address line 2"
              hint="Apartment, suite, or unit if needed."
            />
          </div>
          <TextInputField form={form} step={step} name="city" label="City" />
          <div className="grid gap-6 sm:grid-cols-2">
            <TextInputField
              form={form}
              step={step}
              name="state"
              label="State"
              maxLength={2}
            />
            <TextInputField
              form={form}
              step={step}
              name="zipCode"
              label="ZIP code"
            />
          </div>
        </div>
      );
    case 'disclosures':
      return (
        <div className="space-y-6">
          <ChoiceGroupField
            form={form}
            step={step}
            name="residencyStatus"
            label="Residency status"
            hint="Use the option that best matches the applicant's current status."
            options={[
              { label: 'U.S. citizen', value: 'citizen' },
              { label: 'Permanent resident', value: 'permanent-resident' },
              { label: 'Other eligible status', value: 'other-eligible' },
            ]}
          />
          <ChoiceGroupField
            form={form}
            step={step}
            name="activeMilitary"
            label="Active military status"
            options={[
              {
                label: 'No',
                value: 'no',
                description: 'Continue through the standard consumer flow.',
              },
              {
                label: 'Yes',
                value: 'yes',
                description:
                  'Trigger the service-member review path and disclosures.',
              },
            ]}
          />
          <ChoiceGroupField
            form={form}
            step={step}
            name="openBankruptcy"
            label="Open bankruptcy"
            options={[
              { label: 'No current bankruptcy', value: 'no' },
              { label: 'Currently open', value: 'yes' },
            ]}
          />
          <CheckboxField
            form={form}
            step={step}
            name="creditConsent"
            label="I consent to a soft credit review"
            description="This allows the application to move into pre-approval without affecting the applicant's credit score."
          />
        </div>
      );
    case 'employment-income':
      return (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <TextInputField
              form={form}
              step={step}
              name="employerName"
              label="Employer name"
            />
            <TextInputField
              form={form}
              step={step}
              name="occupation"
              label="Occupation"
            />
          </div>
          <ChoiceGroupField
            form={form}
            step={step}
            name="payFrequency"
            label="Pay frequency"
            options={[
              { label: 'Weekly', value: 'weekly' },
              { label: 'Biweekly', value: 'biweekly' },
              { label: 'Twice monthly', value: 'semi-monthly' },
              { label: 'Monthly', value: 'monthly' },
            ]}
          />
          <TextInputField
            form={form}
            step={step}
            name="monthlyIncome"
            label="Monthly take-home income"
            hint="Enter a monthly estimate using numbers only or a simple currency format."
            inputMode="decimal"
            placeholder="4,500"
          />
          <TextareaField
            form={form}
            step={step}
            name="otherIncomeNotes"
            label="Other income notes"
            hint="Optional context for side income, benefits, or seasonal variability."
            placeholder="Describe anything underwriters should know about the income picture."
          />
        </div>
      );
    case 'bank-card':
      return (
        <div className="space-y-6">
          <TextInputField
            form={form}
            step={step}
            name="bankName"
            label="Bank name"
          />
          <div className="grid gap-6 md:grid-cols-2">
            <TextInputField
              form={form}
              step={step}
              name="routingNumber"
              label="Routing number"
              inputMode="numeric"
            />
            <TextInputField
              form={form}
              step={step}
              name="accountNumber"
              label="Account number"
              inputMode="numeric"
            />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <TextInputField
              form={form}
              step={step}
              name="debitCardLast4"
              label="Debit card last 4"
              hint="Fallback for repayments or funding confirmations."
              inputMode="numeric"
              maxLength={4}
            />
            <ChoiceGroupField
              form={form}
              step={step}
              name="directDeposit"
              label="Direct deposit on file"
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
          <TextInputField
            form={form}
            step={step}
            name="requestedAmount"
            label="Requested amount"
            hint="Use a simple figure like 1500 or 1,500."
            inputMode="decimal"
            placeholder="1,500"
          />
          <SelectField
            form={form}
            step={step}
            name="loanPurpose"
            label="Loan purpose"
            placeholder="Select a reason"
            options={[
              { label: 'Unexpected expense', value: 'unexpected-expense' },
              { label: 'Utilities or rent', value: 'utilities-rent' },
              { label: 'Vehicle repair', value: 'vehicle-repair' },
              { label: 'Medical expense', value: 'medical' },
              { label: 'Debt consolidation', value: 'debt-consolidation' },
            ]}
          />
          <CheckboxField
            form={form}
            step={step}
            name="softReviewConsent"
            label="I want to see a pre-approval result"
            description="This keeps the review moving while preserving a clear handoff into final documents and signing."
          />
        </div>
      );
    case 'documents-signing':
      return (
        <div className="space-y-6">
          <CheckboxField
            form={form}
            step={step}
            name="governmentIdReady"
            label="Government ID is ready"
            description="A current government-issued ID will be required for final verification."
          />
          <CheckboxField
            form={form}
            step={step}
            name="proofOfIncomeReady"
            label="Proof of income is ready"
            description="Recent pay stubs, deposits, or other income evidence help keep underwriting moving."
          />
          <TextInputField
            form={form}
            step={step}
            name="typedSignature"
            label="Typed signature"
            hint="Type the applicant name exactly as it should appear on the document packet."
          />
          <CheckboxField
            form={form}
            step={step}
            name="electronicConsent"
            label="I consent to electronic delivery and signing"
            description="This confirms the applicant can receive disclosures and sign documents electronically."
          />
        </div>
      );
    case 'funding':
      return (
        <div className="space-y-6">
          <ChoiceGroupField
            form={form}
            step={step}
            name="fundingMethod"
            label="Funding method"
            itemClassName="min-h-[96px] rounded-[1.25rem] p-3.5"
            labelClassName="text-base"
            descriptionClassName="mt-2 max-w-[34ch] leading-6"
            options={[
              {
                label: 'Direct deposit',
                value: 'direct-deposit',
                description:
                  'Send approved funds to the verified bank account on file.',
              },
              {
                label: 'Debit card transfer',
                value: 'debit-card',
                description:
                  'Use the verified debit card when instant transfer is available.',
              },
            ]}
          />
          <SelectField
            form={form}
            step={step}
            name="deliveryDestination"
            label="Delivery destination"
            placeholder="Choose destination"
            options={[
              { label: 'Primary bank account', value: 'primary-bank' },
              { label: 'Verified debit card', value: 'verified-card' },
              {
                label: 'Best available verified method',
                value: 'best-available',
              },
            ]}
          />
          <CheckboxField
            form={form}
            step={step}
            name="finalAuthorization"
            label="I understand the final underwriting review comes next"
            description="This acknowledges the submission, the final decision step, and the expected funding timeline after approval."
          />
        </div>
      );
  }
}
