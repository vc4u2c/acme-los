import { ContentPageShell } from '../../../components/web/content-page-shell';

export default function TermsPage() {
  return (
    <ContentPageShell
      eyebrow="Terms of use"
      title="Use the application shell responsibly"
      intro="Terms pages in this space do a lot of quiet trust work. They define permitted use, clarify that submission does not guarantee approval, and set the boundaries for account access."
      sections={[
        {
          title: 'Portal use',
          body: 'Users should provide accurate information, protect login credentials, and avoid any activity that interferes with platform security or availability.',
        },
        {
          title: 'Application accuracy',
          body: 'Submitting information through the shell is a request for review, not a guarantee of approval, pricing, or funding.',
        },
        {
          title: 'Communications',
          body: 'Electronic delivery, alerts, and portal notices may be part of the servicing experience when consent is provided.',
        },
        {
          title: 'Updates',
          body: 'Terms can evolve as products, servicing flows, and regulatory requirements change. Users should be able to review the current version clearly.',
        },
      ]}
    />
  );
}
