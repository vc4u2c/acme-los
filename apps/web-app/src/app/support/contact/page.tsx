import { ContentPageShell } from '../../../components/web/content-page-shell';

export default function ContactPage() {
  return (
    <ContentPageShell
      eyebrow="Customer care"
      title="Contact support before, during, or after an application"
      intro="Financial sites in this category tend to do one thing well in the footer: make it obvious how to reach a real person. This page carries that same clarity forward."
      sections={[
        {
          title: 'Call support',
          body: 'Speak with application support at (833) 410-2746 Monday through Friday from 8:00 AM to 8:00 PM CT, and Saturday from 9:00 AM to 5:00 PM CT.',
        },
        {
          title: 'Email care team',
          body: 'Send customer questions, document issues, or portal support requests to support@acme-los.dev and route time-sensitive concerns through the phone line as well.',
        },
        {
          title: 'Mailing address',
          body: 'ACME LOS Support Center, 1201 Commerce Row, Suite 400, Dallas, Texas 75201.',
        },
        {
          title: 'What support should handle',
          body: 'Application progress, account access, disclosure questions, document readiness, and funding-status clarifications should all feel reachable from the footer and account menu.',
        },
      ]}
    />
  );
}
