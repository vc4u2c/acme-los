import { ContentPageShell } from '../../../components/web/content-page-shell';

export default function PrivacyPage() {
  return (
    <ContentPageShell
      eyebrow="Privacy notice"
      title="How applicant information should be handled"
      intro="Financial footers almost always cluster privacy and consent links together. This page gives that section a credible destination in the shell."
      sections={[
        {
          title: 'Information collected',
          body: 'Personal, employment, banking, and device-related information may be collected to evaluate applications, prevent fraud, and support servicing.',
        },
        {
          title: 'How data is used',
          body: 'Use application data for underwriting, identity verification, customer support, document delivery, and lawful operational reporting.',
        },
        {
          title: 'Sharing and service providers',
          body: 'Service providers may assist with identity checks, payment processing, hosting, and communications, subject to privacy and security controls.',
        },
        {
          title: 'Customer controls',
          body: 'Applicants should be able to access support, update contact details, and understand how preferences or notices can be managed over time.',
        },
      ]}
    />
  );
}
