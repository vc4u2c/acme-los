import { ContentPageShell } from '../../components/web/content-page-shell';

export const revalidate = 60;

export default function RatesAndTermsPage() {
  const refreshedAt = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date());

  return (
    <ContentPageShell
      eyebrow="Rates and terms"
      title="Set expectations before applicants reach pre-approval"
      intro={`A credible lending shell should explain that rates, approval, and funding timing depend on underwriting, eligibility, and state-specific requirements. Demo note: this page revalidates every 60 seconds. Last refreshed at ${refreshedAt}.`}
      sections={[
        {
          title: 'Rate transparency',
          body: 'Show rate ranges, repayment cadence, and representative terms in plain language so the applicant knows what kind of commitment they are evaluating.',
        },
        {
          title: 'Approval expectations',
          body: 'Pre-approval is a checkpoint, not a final commitment. Final approval depends on identity, income, banking, and document review.',
        },
        {
          title: 'Funding timing',
          body: 'Funding speed depends on verification completion, banking method, and the time of final approval. The shell should never imply guaranteed instant funding.',
        },
        {
          title: 'State-specific details',
          body: 'Rates, products, and disclosure obligations can vary by jurisdiction. That is why a legal and licenses section belongs in the footer instead of being buried.',
        },
      ]}
    />
  );
}
