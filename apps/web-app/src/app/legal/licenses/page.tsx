import { ContentPageShell } from '../../../components/web/content-page-shell';

export default function LicensesPage() {
  return (
    <ContentPageShell
      eyebrow="State licenses"
      title="Licensing and availability should never be hidden"
      intro="Lending sites in this space usually devote footer real estate to licensing, state coverage, and product limitations. That is worth carrying into the shell."
      sections={[
        {
          title: 'State availability',
          body: 'Products, disclosures, and approval paths may vary by jurisdiction, which is why state-specific handling belongs in both the flow and the footer.',
        },
        {
          title: 'License references',
          body: 'A production version should publish the lender or servicer entity names, license identifiers, and state-specific notices where required.',
        },
        {
          title: 'Operational clarity',
          body: 'Applicants should know if a product is unavailable in their state before they get deep into the flow.',
        },
        {
          title: 'Why this matters',
          body: 'Licensing and coverage details are part of consumer trust, not just a compliance afterthought. Good financial sites treat them that way.',
        },
      ]}
    />
  );
}
