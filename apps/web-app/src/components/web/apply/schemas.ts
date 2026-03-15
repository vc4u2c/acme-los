import { z } from 'zod';
import type { ApplicationStepSlug } from './step-definitions';

const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

export const schemaMap = {
  'personal-info': z.object({
    firstName: requiredText('First name'),
    lastName: requiredText('Last name'),
    email: z.string().trim().email('Enter a valid email address.'),
    phone: z.string().trim().min(10, 'Enter a phone number.'),
    streetAddress: requiredText('Street address'),
    addressLine2: z.string().trim().optional().catch(''),
    city: requiredText('City'),
    state: z.string().trim().length(2, 'Use a 2-letter state code.'),
    zipCode: z.string().trim().regex(/^\d{5}$/, 'Enter a 5-digit ZIP code.'),
  }),
  disclosures: z.object({
    residencyStatus: requiredText('Residency status'),
    activeMilitary: requiredText('Military status'),
    openBankruptcy: requiredText('Bankruptcy status'),
    creditConsent: z.boolean().refine((value) => value, {
      message: 'Credit consent is required to continue.',
    }),
  }),
  'employment-income': z.object({
    employerName: requiredText('Employer name'),
    occupation: requiredText('Occupation'),
    payFrequency: requiredText('Pay frequency'),
    monthlyIncome: z
      .string()
      .trim()
      .regex(/^\$?\d[\d,]*(\.\d{2})?$/, 'Enter a monthly income amount.'),
    otherIncomeNotes: z.string().trim().optional().catch(''),
  }),
  'bank-card': z.object({
    bankName: requiredText('Bank name'),
    routingNumber: z
      .string()
      .trim()
      .regex(/^\d{9}$/, 'Routing number must be 9 digits.'),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{4,17}$/, 'Account number should be 4 to 17 digits.'),
    debitCardLast4: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Last 4 digits must be exactly 4 numbers.'),
    directDeposit: requiredText('Direct deposit status'),
  }),
  'pre-approval': z.object({
    requestedAmount: z
      .string()
      .trim()
      .regex(/^\$?\d[\d,]*(\.\d{2})?$/, 'Enter the requested amount.'),
    loanPurpose: requiredText('Loan purpose'),
    softReviewConsent: z.boolean().refine((value) => value, {
      message: 'Soft review consent is required to continue.',
    }),
  }),
  'documents-signing': z.object({
    governmentIdReady: z.boolean().refine((value) => value, {
      message: 'Confirm that a government ID is ready.',
    }),
    proofOfIncomeReady: z.boolean().refine((value) => value, {
      message: 'Confirm that proof of income is ready.',
    }),
    typedSignature: requiredText('Typed signature'),
    electronicConsent: z.boolean().refine((value) => value, {
      message: 'Electronic consent is required to continue.',
    }),
  }),
  funding: z.object({
    fundingMethod: requiredText('Funding method'),
    deliveryDestination: requiredText('Delivery destination'),
    finalAuthorization: z.boolean().refine((value) => value, {
      message: 'Final authorization is required to continue.',
    }),
  }),
} satisfies Record<ApplicationStepSlug, z.ZodTypeAny>;
