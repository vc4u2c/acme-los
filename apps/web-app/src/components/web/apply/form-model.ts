import type { ApplicationStepSlug } from './step-definitions';

export type ApplicationFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  residencyStatus: string;
  activeMilitary: string;
  openBankruptcy: string;
  creditConsent: boolean;
  employerName: string;
  occupation: string;
  payFrequency: string;
  monthlyIncome: string;
  otherIncomeNotes: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  debitCardLast4: string;
  directDeposit: string;
  requestedAmount: string;
  loanPurpose: string;
  softReviewConsent: boolean;
  governmentIdReady: boolean;
  proofOfIncomeReady: boolean;
  typedSignature: string;
  electronicConsent: boolean;
  fundingMethod: string;
  deliveryDestination: string;
  finalAuthorization: boolean;
};

export type ApplicationFieldName = keyof ApplicationFormState;

export const defaultApplicationFormState: ApplicationFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  streetAddress: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
  residencyStatus: '',
  activeMilitary: '',
  openBankruptcy: '',
  creditConsent: false,
  employerName: '',
  occupation: '',
  payFrequency: '',
  monthlyIncome: '',
  otherIncomeNotes: '',
  bankName: '',
  routingNumber: '',
  accountNumber: '',
  debitCardLast4: '',
  directDeposit: '',
  requestedAmount: '',
  loanPurpose: '',
  softReviewConsent: false,
  governmentIdReady: false,
  proofOfIncomeReady: false,
  typedSignature: '',
  electronicConsent: false,
  fundingMethod: '',
  deliveryDestination: '',
  finalAuthorization: false,
};

export const stepFieldNames: Record<
  ApplicationStepSlug,
  (keyof ApplicationFormState)[]
> = {
  'personal-info': [
    'firstName',
    'lastName',
    'email',
    'phone',
    'streetAddress',
    'addressLine2',
    'city',
    'state',
    'zipCode',
  ],
  disclosures: [
    'residencyStatus',
    'activeMilitary',
    'openBankruptcy',
    'creditConsent',
  ],
  'employment-income': [
    'employerName',
    'occupation',
    'payFrequency',
    'monthlyIncome',
    'otherIncomeNotes',
  ],
  'bank-card': [
    'bankName',
    'routingNumber',
    'accountNumber',
    'debitCardLast4',
    'directDeposit',
  ],
  'pre-approval': ['requestedAmount', 'loanPurpose', 'softReviewConsent'],
  'documents-signing': [
    'governmentIdReady',
    'proofOfIncomeReady',
    'typedSignature',
    'electronicConsent',
  ],
  funding: ['fundingMethod', 'deliveryDestination', 'finalAuthorization'],
};

export const applyNavigationItems = [];
