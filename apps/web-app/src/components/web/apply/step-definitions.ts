export const applicationSteps = [
  {
    slug: 'personal-info',
    label: 'Personal info',
    shortLabel: 'Personal',
    title: 'Personal information and address',
    description:
      'Start with identity, contact details, and where you live so the application can be routed correctly.',
    supportTitle: 'Why this comes first',
    supportCopy:
      'This is the information most applicants expect to give upfront, and it helps frame the rest of the request without making the first screen feel heavy.',
    highlights: ['Name and contact details', 'Current address', 'Residency basics'],
  },
  {
    slug: 'disclosures',
    label: 'Disclosures',
    shortLabel: 'Disclosures',
    title: 'Required disclosures and eligibility',
    description:
      'Surface the policy and consent items early so applicants know the ground rules before they invest more time.',
    supportTitle: 'Make the legal part readable',
    supportCopy:
      'This step should feel clear, not punitive. Use plain language and grouped decisions so the user can move with confidence.',
    highlights: ['Residency and military status', 'Consent to review', 'Regulatory acknowledgements'],
  },
  {
    slug: 'employment-income',
    label: 'Employment and income',
    shortLabel: 'Income',
    title: 'Employment and income details',
    description:
      'Gather work status, pay rhythm, and monthly income so pre-approval can be framed around stable repayment capacity.',
    supportTitle: 'Keep it practical',
    supportCopy:
      'Applicants usually know this information, but they may not have it perfectly formatted. Labels and examples matter here.',
    highlights: ['Employer and occupation', 'Pay frequency', 'Monthly income picture'],
  },
  {
    slug: 'bank-card',
    label: 'Bank and debit card',
    shortLabel: 'Bank',
    title: 'Bank account and debit card information',
    description:
      'Collect the disbursement and repayment details needed to complete underwriting and prepare funding.',
    supportTitle: 'This is the trust checkpoint',
    supportCopy:
      'Once the user reaches banking details, the page needs to feel especially stable, secure, and transparent.',
    highlights: ['Primary bank account', 'Routing and account number', 'Debit card fallback'],
  },
  {
    slug: 'pre-approval',
    label: 'Pre-approval',
    shortLabel: 'Pre-approval',
    title: 'Review the pre-approval details',
    description:
      'Summarize the request, reinforce what the applicant may qualify for, and confirm the next decision before documents.',
    supportTitle: 'Reward the effort',
    supportCopy:
      'This is the motivational step. It should feel like progress, not another wall of questions.',
    highlights: ['Requested amount', 'Loan purpose', 'Pre-approval review'],
  },
  {
    slug: 'documents-signing',
    label: 'Documents and signing',
    shortLabel: 'Signing',
    title: 'Prepare documents and signing consent',
    description:
      'Confirm the applicant has what they need for final review, then capture the electronic signing consent path.',
    supportTitle: 'Reduce surprise here',
    supportCopy:
      'Call out what documents are needed and what electronic consent means before the user reaches the finish line.',
    highlights: ['Document readiness', 'Typed signature', 'Electronic consent'],
  },
  {
    slug: 'funding',
    label: 'Funding',
    shortLabel: 'Funding',
    title: 'Funding preferences and final review',
    description:
      'Finalize how funds should be delivered and what the applicant should expect once underwriting is complete.',
    supportTitle: 'End with clarity',
    supportCopy:
      'The final step should remove ambiguity about timing, delivery, and what happens next after submission.',
    highlights: ['Funding method', 'Delivery destination', 'Final authorization'],
  },
] as const;

export type ApplicationStepSlug = (typeof applicationSteps)[number]['slug'];

export const applicationStepSlugs = applicationSteps.map(
  (step) => step.slug,
) as ApplicationStepSlug[];

export function getApplicationStep(step: ApplicationStepSlug) {
  const matchedStep = applicationSteps.find((item) => item.slug === step);

  if (!matchedStep) {
    throw new Error(`Unknown application step: ${step}`);
  }

  return matchedStep;
}
